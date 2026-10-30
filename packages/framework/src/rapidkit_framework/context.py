from collections.abc import Iterator
from contextlib import contextmanager
from contextvars import ContextVar
from typing import Any, Protocol
from uuid import UUID

from starlette_context.ctx import _Context, context

_request_state: ContextVar[dict | None] = ContextVar("request_outcome_state", default=None)


@contextmanager
def request_state_scope(state: dict) -> Iterator[None]:
    token = _request_state.set(state)
    try:
        yield
    finally:
        _request_state.reset(token)


def record_business_code(code: int | None, error_kind: str | None = None) -> None:
    state = _request_state.get()
    if state is not None:
        state["business_code"] = code
        if error_kind is not None or code in (None, 0):
            state["error_kind"] = error_kind


def classify_request(state: dict, status: int | None, failed: bool) -> tuple[str, str | None]:
    kind = state.get("error_kind")
    if kind not in {
        "business",
        "validation",
        "authentication",
        "authorization",
        "rate_limited",
        "security_reject",
        "server",
        "transport",
        "cancelled",
    }:
        kind = None
    if failed:
        kind = kind or "server"
    elif status is not None and status >= 400:
        kind = kind or ("server" if status >= 500 else "business")
    elif state.get("business_code") not in (None, 0):
        kind = kind or "business"
    else:
        return "success", None
    return "error", kind


class TypedContextProtocol(Protocol):
    """上下文类型协议，定义了请求上下文中可用的属性。"""

    user_id: UUID | None
    actor_id: UUID | None
    impersonation_session_id: UUID | None

    ip: str

    user_agent: str
    os: str | None
    browser: str | None
    device: str | None

    language: str


class TypedContext(TypedContextProtocol, _Context):
    """带类型的上下文对象，支持属性访问和赋值。"""

    def __getattr__(self, name: str) -> Any:
        return context.get(name)

    def __setattr__(self, name: str, value: Any) -> None:
        context[name] = value


ctx = TypedContext()
