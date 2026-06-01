"""
PermissionContext — request-level permission container.

Built once by RBAC dep, consumed by ABAC filters within the same request.

Author : Coke
Date   : 2026-05-08
"""

from dataclasses import dataclass, field
from uuid import UUID

from plugin_permission.cache import CachedPermissions


@dataclass
class PermissionContext:
    """Request-scoped permission state. Built by RBAC, consumed by ABAC."""

    user: object
    cached_role_versions: dict[str, int]
    current_role_versions: dict[str, int]
    data_policy_ids: list[UUID] = field(default_factory=list)
    field_policy_ids: list[UUID] = field(default_factory=list)
    permissions: list[str] = field(default_factory=list)
    buttons: list[str] = field(default_factory=list)

    _policies: list | None = field(default=None, init=False, repr=False)

    @property
    def is_stale(self) -> bool:
        """Check if any role version has changed since cache was built."""
        if set(self.cached_role_versions.keys()) != set(self.current_role_versions.keys()):
            return True
        return any(
            self.cached_role_versions.get(code) != self.current_role_versions.get(code)
            for code in self.current_role_versions
        )

    async def get_policies(self, loader) -> list:
        """Lazy-load policies once per request."""
        if self._policies is None:
            self._policies = await loader.load(self.data_policy_ids)
        return self._policies

    def to_cached_permissions(self) -> CachedPermissions:
        """Build a CachedPermissions for storage."""
        return CachedPermissions(
            permissions=self.permissions,
            buttons=self.buttons,
            data_policy_ids=self.data_policy_ids,
            field_policy_ids=self.field_policy_ids,
            role_versions=self.current_role_versions,
        )
