"""
审计中间件 — 自动捕获变更操作并写入 ActivityLog。

拦截 POST/PUT/PATCH/DELETE 请求，提取用户上下文、请求体（脱敏），
通过 AsyncBatchQueue 异步批量写入数据库。

Author : Coke
Date   : 2026-04-20
"""

import json
import re
from typing import TYPE_CHECKING
from uuid import UUID

from rapidkit_core.auth_config import auth_settings
from rapidkit_core.config import settings
from rapidkit_core.context import ctx
from rapidkit_core.log import logger
from rapidkit_core.security import decode_token
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

if TYPE_CHECKING:
    from rapidkit_core.batch_queue import AsyncBatchQueue

# 模块级 queue 实例，由 lifecycle.py 在 startup 时初始化
audit_queue: "AsyncBatchQueue[dict] | None" = None

_MUTATION_METHODS = {"POST", "PUT", "PATCH", "DELETE"}


def _is_excluded_path(path: str) -> bool:
    """检查路径是否在排除列表中。"""
    return any(path.startswith(prefix) for prefix in settings.AUDIT_EXCLUDE_PATHS)


def _redact_sensitive(data: dict, sensitive_fields: list[str] | None = None) -> dict:
    """递归脱敏敏感字段。"""
    fields = sensitive_fields or settings.AUDIT_SENSITIVE_FIELDS
    redacted = {}
    for key, value in data.items():
        if any(s in key.lower() for s in fields):
            redacted[key] = "[REDACTED]"
        elif isinstance(value, dict):
            redacted[key] = _redact_sensitive(value, fields)
        else:
            redacted[key] = value
    return redacted


def _truncate_body(body_dict: dict) -> dict | None:
    """将请求体截断至 AUDIT_MAX_BODY_SIZE。"""
    try:
        raw = json.dumps(body_dict, ensure_ascii=False, default=str)
        if len(raw.encode()) > settings.AUDIT_MAX_BODY_SIZE:
            truncated = raw.encode()[: settings.AUDIT_MAX_BODY_SIZE].decode("utf-8", errors="ignore")
            return {"_truncated": True, "_preview": truncated}
        return body_dict
    except Exception:
        return None


def _extract_user_from_token(request: Request) -> tuple[UUID | None, str | None]:
    """从 Authorization header 中解码 JWT 获取用户信息。"""
    auth_header = request.headers.get("authorization", "")
    if not auth_header.startswith("Bearer "):
        return None, None
    try:
        jwt_data = decode_token(auth_header[7:], auth_settings.ACCESS_TOKEN_KEY)
        return jwt_data.sub, jwt_data.name
    except Exception:
        return None, None


def _parse_request_body(raw: bytes) -> dict | None:
    """尝试将原始请求体解析为 dict。"""
    if not raw:
        return None
    try:
        return json.loads(raw)
    except json.JSONDecodeError, UnicodeDecodeError:
        return None


def _extract_response_code(response: Response) -> int | None:
    """尝试从响应体中提取业务 code（仅适用于 JSON 响应）。"""
    content_type = response.headers.get("content-type", "")
    if "application/json" not in content_type:
        return None
    try:
        if hasattr(response, "body"):
            data = json.loads(bytes(response.body))
            return data.get("code")
    except Exception:
        pass
    return None


_UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.IGNORECASE)
_NUMERIC_RE = re.compile(r"^\d+$")

# 特殊路径映射
_SPECIAL_PATHS: dict[str, str] = {
    "/auth/login": "auth.login",
    "/auth/logout": "auth.logout",
    "/auth/refresh": "auth.refresh",
}

# HTTP 方法 → action 映射
_METHOD_ACTION: dict[str, str] = {
    "POST": "create",
    "PUT": "update",
    "PATCH": "update",
    "DELETE": "delete",
}

# 候选名称字段（从请求体中提取 target）
_NAME_FIELDS = ("name", "username", "title", "label", "menu_name", "menuName", "roleName", "code")


def _is_id_segment(segment: str) -> bool:
    """判断路径段是否为 ID（UUID 或纯数字）。"""
    return bool(_UUID_RE.match(segment) or _NUMERIC_RE.match(segment))


def _parse_event_type(method: str, path: str) -> str:
    """将 HTTP method + path 解析为 resource.action 格式的 event_type。"""
    # 去除 API 前缀
    stripped = path
    if path.startswith("/api/v1"):
        stripped = path[7:]  # len("/api/v1") == 7
    elif path.startswith("/api"):
        stripped = path[4:]

    # 检查特殊路径
    for special_path, event_type in _SPECIAL_PATHS.items():
        if stripped == special_path or stripped.rstrip("/") == special_path:
            return event_type

    # 提取非 ID 段
    segments = [s for s in stripped.split("/") if s and not _is_id_segment(s)]

    if not segments:
        return f"unknown.{_METHOD_ACTION.get(method, 'unknown')}"

    # resource 取最后一个非 ID 段
    resource = segments[-1]
    action = _METHOD_ACTION.get(method, "unknown")

    return f"{resource}.{action}"


def _extract_target(body_dict: dict | None, username: str | None) -> str:
    """从请求体中提取操作目标名称。"""
    if not body_dict:
        return username or ""

    for field in _NAME_FIELDS:
        value = body_dict.get(field)
        if value and isinstance(value, str):
            return value

    return username or ""


class AuditMiddleware(BaseHTTPMiddleware):
    """审计中间件：自动记录变更操作到 ActivityLog。"""

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        if not settings.AUDIT_ENABLED:
            return await call_next(request)

        if request.method not in _MUTATION_METHODS:
            return await call_next(request)

        if _is_excluded_path(request.url.path):
            return await call_next(request)

        # 读取请求体
        raw_body = await request.body()
        body_dict = _parse_request_body(raw_body)

        # 提取用户信息
        user_id, username = _extract_user_from_token(request)

        # 获取上下文信息（由 StateMiddleware 设置）
        source_ip: str | None = None
        user_agent_str: str | None = None
        try:
            source_ip = ctx.ip
        except Exception:
            pass
        try:
            user_agent_str = ctx.user_agent
        except Exception:
            pass

        # 调用下游
        response = await call_next(request)

        # 提取响应 code
        response_code = _extract_response_code(response)

        # 构建审计记录
        redacted_body = None
        if body_dict:
            redacted_body = _truncate_body(_redact_sensitive(body_dict))

        # 生成结构化 event_type：resource.action
        event_type = _parse_event_type(request.method, request.url.path)
        target = _extract_target(body_dict, username)

        audit_record = {
            "event_type": event_type,
            "params": {"target": target} if target else {},
            "detail": None,
            "source_ip": source_ip,
            "user_id": user_id,
            "username": username,
            "http_method": request.method,
            "path": request.url.path,
            "user_agent": user_agent_str,
            "request_body": redacted_body,
            "response_code": response_code,
        }

        # 异步写入队列
        if audit_queue is not None:
            try:
                await audit_queue.put(audit_record)
            except Exception:
                logger.debug("Failed to queue audit record", exc_info=True)

        return response
