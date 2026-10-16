"""Identity metadata shared by HTTP, socket, and worker execution contexts."""

from collections.abc import Iterator
from contextlib import contextmanager
from contextvars import ContextVar
from dataclasses import asdict, dataclass


@dataclass(frozen=True)
class IdentityMetadata:
    user_id: str | None = None
    actor_id: str | None = None
    impersonation_session_id: str | None = None


_identity: ContextVar[IdentityMetadata] = ContextVar("audit_identity", default=IdentityMetadata())


def current_identity() -> IdentityMetadata:
    return _identity.get()


def bind_identity(metadata: IdentityMetadata) -> None:
    _identity.set(metadata)


@contextmanager
def identity_scope(metadata: IdentityMetadata) -> Iterator[None]:
    token = _identity.set(metadata)
    try:
        yield
    finally:
        _identity.reset(token)


IDENTITY_HEADER_KEYS = ("user_id", "actor_id", "impersonation_session_id")


def identity_headers(metadata: IdentityMetadata | None = None) -> dict[str, str]:
    return {key: value for key, value in asdict(metadata or current_identity()).items() if value is not None}


def identity_from_headers(headers: dict | None) -> IdentityMetadata:
    headers = headers or {}
    return IdentityMetadata(
        **{key: str(headers[key]) if headers.get(key) is not None else None for key in IDENTITY_HEADER_KEYS}
    )
