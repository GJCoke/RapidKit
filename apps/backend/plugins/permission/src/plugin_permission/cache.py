"""
Permission cache protocol and default implementations.

Author : Coke
Date   : 2026-05-07
"""

from typing import Protocol
from uuid import UUID

from rapidkit_common.schemas.base import BaseModel

permission_structure = "auth:permission:<{user_id}>"


class CachedPermissions(BaseModel):
    """Cached permission data for a user."""

    codes: list[str] = []
    data_scopes: dict[str, list[str]] = {}
    field_modes: dict[str, dict[str, str]] = {}
    role_versions: dict[str, int] = {}
    catalog_version: int = 0


class RoleSnapshot(BaseModel):
    """按角色版本与目录版本缓存的角色效果快照（权限码未展开）。"""

    code: str
    active: bool = False
    permission_codes: list[str] = []

    data_scopes: dict[str, str] = {}
    field_modes: dict[str, dict[str, str]] = {}


class PermissionCache(Protocol):
    """Seam for permission caching — inject Redis, dict, or any backend."""

    async def get(self, user_id: UUID) -> CachedPermissions | None: ...

    async def set(self, user_id: UUID, data: CachedPermissions) -> None: ...

    async def invalidate(self, user_id: UUID) -> None: ...


class InMemoryPermissionCache:
    """In-memory implementation for testing."""

    def __init__(self) -> None:
        self._store: dict[UUID, CachedPermissions] = {}

    async def get(self, user_id: UUID) -> CachedPermissions | None:
        return self._store.get(user_id)

    async def set(self, user_id: UUID, data: CachedPermissions) -> None:
        self._store[user_id] = data

    async def invalidate(self, user_id: UUID) -> None:
        self._store.pop(user_id, None)
