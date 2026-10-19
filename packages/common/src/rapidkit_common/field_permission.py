"""
字段脱敏函数注册表，供字段规则序列化（``rapidkit_common.scope_runtime``）使用。

Author : Coke
Date   : 2026-05-14
"""

from collections.abc import Callable
from typing import Any


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
