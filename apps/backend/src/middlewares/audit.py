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

from rapidkit_common.audit import AuditBatch, AuditContext, AuditRecord, current_audit
from rapidkit_common.request import get_client_ip, parse_user_agent
from rapidkit_core.config import settings
from rapidkit_core.log import logger
from rapidkit_core.nanoid import get_request_nanoid
from rapidkit_core.timezone import timezone
from rapidkit_framework.audit import AuditActorType, AuditResult
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response
from starlette.routing import Match

if TYPE_CHECKING:
    from rapidkit_core.batch_queue import AsyncBatchQueue

# 模块级 queue 实例，由 lifecycle.py 在 startup 时初始化
audit_queue: "AsyncBatchQueue[dict | AuditRecord] | None" = None


def record_audit_outcome(
    request: Request, *, business_code: int | None, error_key: str | None = None, error_message: str | None = None
) -> None:
    request.state.audit_business_code = business_code
    context = getattr(request.state, "audit_context", None)
    if context is not None:
        context.record.business_code = business_code
        context.record.error_key = error_key
        context.record.error_message = error_message[:1024] if error_message else None
        context.confirm(AuditResult.FAILURE if business_code not in (None, 0) else AuditResult.SUCCESS)


def _v2_identity(request: Request) -> dict:
    values = _read_auth_identity(request)
    auth = getattr(request.state, "auth", None)
    actor = getattr(auth, "actor", None)
    values["actor_username"] = vars(actor).get("username") if actor is not None else None
    values["actor_type"] = (
        AuditActorType.USER
        if values["actor_id"]
        else (AuditActorType.UNKNOWN if request.headers.get("authorization") else AuditActorType.ANONYMOUS)
    )
    context = getattr(request.state, "audit_context", None)
    subject = getattr(auth, "subject", None)
    if context is not None and subject is not None and values.get("impersonation_session_id"):
        context.record.metadata.subject_name = vars(subject).get("name")
        context.record.metadata.subject_username = vars(subject).get("username")
    return values


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

        if getattr(settings, "AUDIT_V2_ENABLED", False):
            return await self.dispatch_v2(request, call_next)

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

    async def dispatch_v2(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        context = AuditContext()
        request.state.audit_context = context
        context.record.path = request.url.path[:500]
        context.record.http_method = request.method
        context.record.request_id = get_request_nanoid() if get_request_nanoid() != "-" else None
        context.record.ip = get_client_ip(request)
        user_agent = parse_user_agent(request)
        context.record.user_agent = user_agent.user_agent[:500] if user_agent else None
        context.identity_provider = lambda: _v2_identity(request)

        async def publish(record):
            if audit_queue is not None:
                try:
                    await audit_queue.put(record)
                except Exception:
                    logger.error("Audit event could not be queued id={}", record.id, exc_info=True)

        context.publish = publish
        definitions = {
            action.code: action
            for manifest in getattr(request.app.state, "plugins", [])
            for action in manifest.audit_actions
        }
        for route in request.app.routes:
            matched, child = route.matches(request.scope)
            if matched == Match.FULL:
                declaration = (getattr(route, "openapi_extra", None) or {}).get("x-audit", {})
                if declaration.get("exclude"):
                    return await call_next(request)
                definition = definitions.get(declaration.get("action"))
                if definition is not None:
                    context.action_def = definition
                    context.record.action = definition.code
                    context.record.resource_type = definition.resource_type
                    context.record.risk_level = definition.risk_level
                    if definition.id_parameter:
                        value = child.get("path_params", {}).get(definition.id_parameter)
                        context.record.resource_id = str(value) if value is not None else None
                break
        body = _parse_request_body(await request.body())
        if isinstance(body, dict) and context.action_def is not None:
            if context.record.action.endswith(".batch-delete") and isinstance(body.get("ids"), list):
                ids = {str(value) for value in body["ids"]}
                context.record.metadata.batch = AuditBatch(requested=len(ids))
                for value in ids:
                    try:
                        valid_id = str(UUID(value))
                    except ValueError, TypeError:
                        continue
                    context.captured[valid_id] = {"id": valid_id, "name": None}
            from pydantic.alias_generators import to_camel

            allowed = set(context.action_def.fields) | {to_camel(key) for key in context.action_def.fields}
            summary = {key: value for key, value in body.items() if key in allowed}
            context.record.request_summary = (
                _truncate_body(_sanitize_mapping(summary, settings.AUDIT_SENSITIVE_FIELDS)) if summary else None
            )
        token = current_audit.set(context)
        try:
            response = await call_next(request)
            if context.committed:
                return response
            context.record.response_code = response.status_code
            if getattr(request.state, "auth", None) is not None or context.record.actor_id is None:
                for key, value in _v2_identity(request).items():
                    setattr(context.record, key, value)
            auth = getattr(request.state, "auth", None)
            subject = getattr(auth, "subject", None)
            if subject is not None and context.record.impersonation_session_id:
                context.record.metadata.subject_name = vars(subject).get("name")
                context.record.metadata.subject_username = vars(subject).get("username")
            if not context.confirmed and not context.deferred:
                context.confirm(
                    AuditResult.SUCCESS if context.action_def and response.status_code < 400 else AuditResult.UNKNOWN
                )
            if response.status_code >= 400:
                context.confirm(AuditResult.FAILURE)
            if not context.deferred or context.record.result == AuditResult.FAILURE:
                await publish(context.snapshot())
            return response
        except Exception:
            if not context.committed:
                context.confirm(AuditResult.FAILURE)
                context.record.error_key = "common.error.internalServerError"
                context.record.error_message = None
                await publish(context.snapshot())
            raise
        finally:
            current_audit.reset(token)
