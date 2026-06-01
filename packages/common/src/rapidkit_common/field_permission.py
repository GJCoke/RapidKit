"""
字段权限过滤抽象层。

提供 FieldPermissionFilter（FastAPI Depends）和 FieldRestrictions 数据类。
默认不做任何过滤（返回空限制）。permission 插件在启动时通过
set_field_permission_resolver() 注入真实实现。

Author : Coke
Date   : 2026-05-14
"""

from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from typing import Any, Literal

from fastapi import Request
from rapidkit_common.auth import UserDBDep
from rapidkit_common.deps import RedisDep, SessionDep
from rapidkit_common.models import SQLModel


@dataclass
class FieldRestrictions:
    """Aggregated field-level restrictions for a request."""

    stripped: list[str] = field(default_factory=list)
    masked: list[str] = field(default_factory=list)
    denied: list[str] = field(default_factory=list)

    @property
    def is_empty(self) -> bool:
        return not self.stripped and not self.masked and not self.denied


def serialize_with_restrictions(data: dict[str, Any], restrictions: FieldRestrictions) -> dict[str, Any]:
    """
    Apply field restrictions to a response dict.

    - stripped fields are removed
    - masked fields have values replaced with masked versions
    """
    if restrictions.is_empty:
        return data

    result = {}
    for key, value in data.items():
        if key in restrictions.stripped:
            continue
        elif key in restrictions.masked:
            masker = get_masker(key)
            result[key] = masker(value)
        else:
            result[key] = value

    return result


def _mask_phone(value: str | None) -> str | None:
    if value is None:
        return None
    if len(value) <= 4:
        return "***"
    return f"{value[:3]}****{value[-4:]}"


def _mask_email(value: str | None) -> str | None:
    if value is None:
        return None
    if "@" not in value:
        return "***"
    local, domain = value.split("@", 1)
    return f"{local[0]}***@{domain}"


def _mask_id_card(value: str | None) -> str | None:
    if value is None:
        return None
    if len(value) <= 8:
        return "***"
    return f"{value[:4]}{'*' * (len(value) - 8)}{value[-4:]}"


def _mask_default(value: Any) -> Any:
    if value is None:
        return None
    return "******"


_MASKER_REGISTRY: dict[str, Callable[..., Any]] = {
    "phone": _mask_phone,
    "mobile": _mask_phone,
    "email": _mask_email,
    "id_card": _mask_id_card,
    "id_number": _mask_id_card,
}


def get_masker(field_name: str) -> Callable[..., Any]:
    """Get the appropriate masker for a field name. Falls back to default."""
    for pattern, masker in _MASKER_REGISTRY.items():
        if pattern in field_name.lower():
            return masker
    return _mask_default


# --- Pluggable resolver ---

ResolverType = Callable[..., Awaitable["FieldRestrictions"]]

_resolver: ResolverType | None = None


def set_field_permission_resolver(resolver: ResolverType) -> None:
    """由 permission 插件调用，注入真实的字段权限解析器。"""
    global _resolver
    _resolver = resolver


class FieldPermissionFilter:
    """
    Field permission filter as FastAPI Depends.

    Usage::

        @router.get("")
        async def get_items(
            field_rules: Annotated[FieldRestrictions, Depends(FieldPermissionFilter(MyModel))],
        ):
            if not field_rules.is_empty:
                ...

    When permission plugin is not loaded, returns empty FieldRestrictions (no filtering).
    """

    def __init__(self, model: type[SQLModel], action: Literal["read", "write"] = "read") -> None:
        self.model = model
        self.action = action

    async def __call__(
        self,
        request: Request,
        user: UserDBDep,
        redis: RedisDep,
        session: SessionDep,
    ) -> FieldRestrictions:
        """Resolve field restrictions via the injected resolver or return empty."""
        if _resolver is None:
            return FieldRestrictions()
        return await _resolver(self.model, self.action, request, user, redis, session)
