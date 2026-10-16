"""
审计中间件 — 自动捕获变更操作并写入 AuditLog。

拦截 POST/PUT/PATCH/DELETE 请求，提取用户上下文、请求体（脱敏），
通过 AsyncBatchQueue 异步批量写入数据库。

Author : Coke
Date   : 2026-04-20
"""

import json
import re
from typing import TYPE_CHECKING
from uuid import UUID

from rapidkit_common.request import get_client_ip, parse_user_agent
from rapidkit_core.config import settings
from rapidkit_core.log import logger
from rapidkit_core.timezone import timezone
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

if TYPE_CHECKING:
    from rapidkit_core.batch_queue import AsyncBatchQueue

# 模块级 queue 实例，由 lifecycle.py 在 startup 时初始化
audit_queue: "AsyncBatchQueue[dict] | None" = None

_MUTATION_METHODS = {"POST", "PUT", "PATCH", "DELETE"}
_DEFAULT_EXCLUDED_PATHS = (
    "/health",
    "/metrics",
    "/socket.io",
    "/docs",
    "/openapi.json",
    "/redoc",
    "/api/v1/auth/token/refresh",
    "/api/v1/auth/impersonations",
)
_DEFAULT_SENSITIVE_FIELDS = (
    "password",
    "token",
    "secret",
    "key",
    "authorization",
    "cookie",
    "verification_code",
)


def _is_excluded_path(path: str, prefixes: list[str] | tuple[str, ...] | None = None) -> bool:
    """检查路径是否在排除列表中。"""
    return any(path.startswith(prefix) for prefix in (prefixes or _DEFAULT_EXCLUDED_PATHS))


def _normalize_key(value: str) -> str:
    return "".join(character for character in value.casefold() if character.isalnum())


def _sanitize_mapping(
    data: dict,
    sensitive_fields: list[str] | None = None,
    *,
    _depth: int = 0,
    _counter: list[int] | None = None,
) -> dict:
    """Remove sensitive values and bound the retained request summary."""
    fields = {_normalize_key(item) for item in (sensitive_fields or _DEFAULT_SENSITIVE_FIELDS)}
    counter = _counter or [0]
    sanitized: dict = {}
    if _depth >= 5:
        return sanitized
    for key, value in data.items():
        normalized = _normalize_key(str(key))
        if any(normalized == field or normalized.endswith(field) for field in fields):
            continue
        if counter[0] >= 100:
            break
        counter[0] += 1
        if isinstance(value, dict):
            sanitized[key] = _sanitize_mapping(value, sensitive_fields, _depth=_depth + 1, _counter=counter)
        elif isinstance(value, list):
            sanitized[key] = [
                _sanitize_mapping(item, sensitive_fields, _depth=_depth + 1, _counter=counter)
                if isinstance(item, dict)
                else item
                for item in value[:100]
            ]
        elif value is None or isinstance(value, str | int | float | bool):
            sanitized[key] = value
    return sanitized


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


def _read_auth_identity(request: Request) -> dict:
    """Read only identity verified and published by the downstream resolver."""
    auth = getattr(request.state, "auth", None)
    actor = getattr(auth, "actor", None)
    subject = getattr(auth, "subject", None)
    session_id = getattr(auth, "impersonation_session_id", None)
    # ORM descriptors can lazy-load expired detached instances after rollback.
    # Read loaded values only; IdentifiedAuth retains signed scalar IDs/snapshots.
    actor_values = vars(actor) if actor is not None else {}
    subject_values = vars(subject) if subject is not None else {}
    return {
        "actor_id": getattr(auth, "actor_id", None) or actor_values.get("id"),
        "actor_name": getattr(auth, "actor_name", None) or actor_values.get("name") or actor_values.get("username"),
        "subject_user_id": (getattr(auth, "subject_user_id", None) or subject_values.get("id"))
        if session_id is not None
        else None,
        "impersonation_session_id": session_id,
    }


def _parse_request_body(raw: bytes) -> dict | None:
    """尝试将原始请求体解析为 dict。"""
    if not raw:
        return None
    try:
        return json.loads(raw)
    except json.JSONDecodeError, UnicodeDecodeError:
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


def _build_audit_record(
    *,
    method: str,
    path: str,
    actor_id: UUID | None,
    actor_name: str | None,
    ip: str | None,
    user_agent: str | None,
    request_summary: dict | None,
    response_code: int | None,
    http_status: int,
    request_id: str | None = None,
    resource_name: str | None = None,
    subject_user_id: UUID | None = None,
    impersonation_session_id: UUID | None = None,
    audit_business_code: int | None = None,
) -> dict:
    """Build the technical audit persistence shape, never an activity shape."""
    action = _parse_event_type(method, path)
    resource_type = action.partition(".")[0]
    return {
        "actor_id": actor_id,
        "actor_name": actor_name,
        "subject_user_id": subject_user_id,
        "impersonation_session_id": impersonation_session_id,
        "action": action,
        "resource_type": resource_type,
        "resource_id": None,
        "resource_name": resource_name,
        "result": "success" if http_status < 400 and audit_business_code in (None, 0) else "failure",
        "risk_level": "normal",
        "source": "http",
        "request_id": request_id,
        "correlation_id": request_id,
        "ip": ip,
        "user_agent": user_agent,
        "http_method": method,
        "path": path,
        "request_summary": request_summary,
        "response_code": response_code,
        "error_message": None,
        "extra_data": {},
        "occurred_at": timezone.now(),
    }


class AuditMiddleware(BaseHTTPMiddleware):
    """审计中间件：自动记录变更操作到 AuditLog。"""

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        if not settings.AUDIT_ENABLED:
            return await call_next(request)

        if request.method not in _MUTATION_METHODS:
            return await call_next(request)

        if _is_excluded_path(request.url.path, settings.AUDIT_EXCLUDE_PATHS):
            return await call_next(request)

        # 读取请求体
        raw_body = await request.body()
        body_dict = _parse_request_body(raw_body)

        # 直接从请求提取客户端信息，避免依赖 StateMiddleware 的执行顺序
        source_ip = get_client_ip(request)
        user_agent = parse_user_agent(request)
        user_agent_str = user_agent.user_agent if user_agent else None

        # 调用下游
        response = await call_next(request)

        if getattr(request.state, "impersonation_lifecycle_audited", False):
            return response
        identity = _read_auth_identity(request)
        username = identity["actor_name"]

        # 构建审计记录
        redacted_body = None
        if body_dict:
            redacted_body = _truncate_body(_sanitize_mapping(body_dict, settings.AUDIT_SENSITIVE_FIELDS))

        target = _extract_target(body_dict, username)

        audit_record = _build_audit_record(
            method=request.method,
            path=request.url.path,
            **identity,
            audit_business_code=getattr(request.state, "audit_business_code", None),
            ip=source_ip,
            user_agent=user_agent_str,
            request_summary=redacted_body,
            response_code=response.status_code,
            http_status=response.status_code,
            request_id=request.headers.get("x-request-id"),
            resource_name=target or None,
        )

        if identity["impersonation_session_id"] is not None:
            auth = request.state.auth
            subject = getattr(auth, "subject", None)
            subject_values = vars(subject) if subject is not None else {}
            audit_record["extra_data"] = {
                "subject_name": getattr(auth, "subject_name", None) or subject_values.get("name"),
                "subject_username": getattr(auth, "subject_username", None) or subject_values.get("username"),
            }

        # 异步写入队列
        if audit_queue is not None:
            try:
                await audit_queue.put(audit_record)
            except Exception:
                logger.debug("Failed to queue audit record", exc_info=True)

        return response
