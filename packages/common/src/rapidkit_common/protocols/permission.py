"""RBAC domain protocols."""

from typing import Protocol
from uuid import UUID

from rapidkit_core.redis_client import AsyncRedisClient
from rapidkit_framework.scopes import RestrictedMode


class PermissionChecker(Protocol):
    """Check route-level permissions. Provided by plugin_permission."""

    async def check_route_permission(self, user_id: UUID, route_key: str) -> bool: ...


class PermissionCacheManager(Protocol):
    """Manage user permission cache. Provided by plugin_permission, consumed by plugin_auth."""

    async def build(self, user_id: UUID, roles: list[str], redis: AsyncRedisClient) -> None:
        """Build and store permission cache for a user after login/refresh."""
        ...

    async def get_buttons(self, user_id: UUID, roles: list[str], redis: AsyncRedisClient) -> list[str]:
        """Get cached button permissions for a user (rebuild if missing)."""
        ...

    async def get_restricted_fields(
        self, user_id: UUID, roles: list[str], redis: AsyncRedisClient
    ) -> dict[str, dict[str, RestrictedMode]]:
        """Get resource → field → mode (masked / hidden) for the user's merged field rules."""
        ...

    async def invalidate(self, user_id: UUID, redis: AsyncRedisClient) -> None:
        """Delete permission cache for a user (logout)."""
        ...

    async def get_role_codes(self, roles: list[str]) -> set[str]:
        """Get the expanded permission codes granted by the given role codes."""
        ...

    async def get_catalog_version(self) -> int:
        """Get the permission catalog version; it changes when baseline codes or extensions change."""
        ...


class PermissionCatalogReader(Protocol):
    """Read the effective permission catalog (baseline + extensions). Provided by plugin_permission."""

    def has_code(self, code: str) -> bool:
        """Whether the code exists in the effective catalog."""
        ...
