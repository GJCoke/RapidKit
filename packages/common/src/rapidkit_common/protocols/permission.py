"""RBAC/ABAC domain protocols."""

from typing import Protocol
from uuid import UUID

from rapidkit_core.redis_client import AsyncRedisClient


class PermissionChecker(Protocol):
    """Check route-level permissions. Provided by plugin_permission."""

    async def check_route_permission(self, user_id: UUID, route_key: str) -> bool: ...


class PolicyLoader(Protocol):
    """Load data policies for a user. Provided by plugin_permission."""

    async def load_user_policies(self, user_id: UUID) -> list[dict]: ...


class PermissionCacheManager(Protocol):
    """Manage user permission cache. Provided by plugin_permission, consumed by plugin_auth."""

    async def build(self, user_id: UUID, roles: list[str], redis: AsyncRedisClient) -> None:
        """Build and store permission cache for a user after login/refresh."""
        ...

    async def get_buttons(self, user_id: UUID, roles: list[str], redis: AsyncRedisClient) -> list[str]:
        """Get cached button permissions for a user (rebuild if missing)."""
        ...

    async def invalidate(self, user_id: UUID, redis: AsyncRedisClient) -> None:
        """Delete permission cache for a user (logout)."""
        ...

    async def get_permitted_routes(self, roles: list[str]) -> set[str]:
        """Get the set of permitted route names for given role codes."""
        ...
