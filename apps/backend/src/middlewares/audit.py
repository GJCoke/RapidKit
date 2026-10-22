"""
审计中间件 — 自动捕获变更操作并写入 AuditLog。

拦截变更请求，按声明的动作和字段采集结构化审计，通过批量队列或业务事务持久化。

Author : Coke
Date   : 2026-04-20
"""

import json
from typing import TYPE_CHECKING
from uuid import UUID

from rapidkit_common.audit import AuditBatch, AuditContext, AuditRecord, current_audit
from rapidkit_common.request import get_client_ip, parse_user_agent
from rapidkit_core.config import settings
from rapidkit_core.log import logger
from rapidkit_core.nanoid import get_request_nanoid
from rapidkit_framework.audit import AuditActorType, AuditResult
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response
from starlette.routing import Match

from src.health import is_internal_path

if TYPE_CHECKING:
    from rapidkit_core.batch_queue import AsyncBatchQueue

# 模块级 queue 实例，由 lifecycle.py 在 startup 时初始化
audit_queue: "AsyncBatchQueue[AuditRecord] | None" = None


def record_audit_outcome(
    request: Request, *, business_code: int | None, error_key: str | None = None, error_message: str | None = None
) -> None:
    request.state.business_code = business_code
    context = getattr(request.state, "audit_context", None)
    if context is not None:
        context.record.business_code = business_code
        context.record.error_key = error_key
        context.record.error_message = error_message[:1024] if error_message else None
        context.confirm(AuditResult.FAILURE if business_code not in (None, 0) else AuditResult.SUCCESS)


def _audit_identity(request: Request) -> dict:
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
        context.record.metadata.subject_name = getattr(auth, "subject_name", None) or vars(subject).get("name")
        context.record.metadata.subject_username = getattr(auth, "subject_username", None) or vars(subject).get(
            "username"
        )
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


class AuditMiddleware(BaseHTTPMiddleware):
    """审计中间件：自动记录变更操作到 AuditLog。"""

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        if is_internal_path(request.url.path):
            return await call_next(request)
        if not settings.AUDIT_ENABLED:
            return await call_next(request)

        if request.method not in _MUTATION_METHODS:
            return await call_next(request)

        if _is_excluded_path(request.url.path, settings.AUDIT_EXCLUDE_PATHS):
            return await call_next(request)

        context = AuditContext()
        request.state.audit_context = context
        context.record.path = request.url.path[:500]
        context.record.http_method = request.method
        context.record.request_id = get_request_nanoid() if get_request_nanoid() != "-" else None
        context.record.ip = get_client_ip(request)
        user_agent = parse_user_agent(request)
        context.record.user_agent = user_agent.user_agent[:500] if user_agent else None
        context.identity_provider = lambda: _audit_identity(request)

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
            if context.committed or getattr(request.state, "impersonation_lifecycle_audited", False):
                return response
            context.record.response_code = response.status_code
            if getattr(request.state, "auth", None) is not None or context.record.actor_id is None:
                for key, value in _audit_identity(request).items():
                    setattr(context.record, key, value)
            auth = getattr(request.state, "auth", None)
            subject = getattr(auth, "subject", None)
            if subject is not None and context.record.impersonation_session_id:
                context.record.metadata.subject_name = getattr(auth, "subject_name", None) or vars(subject).get("name")
                context.record.metadata.subject_username = getattr(auth, "subject_username", None) or vars(subject).get(
                    "username"
                )
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
