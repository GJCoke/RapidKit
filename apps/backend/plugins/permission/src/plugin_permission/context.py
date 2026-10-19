"""
PermissionContext — request-level permission container.

Built once by the access resolver, consumed by in-handler checks within the same request.

Author : Coke
Date   : 2026-05-08
"""

from dataclasses import dataclass, field

from plugin_permission.catalog.registry import get_catalog


@dataclass
class PermissionContext:
    """Request-scoped permission state built by the access resolver."""

    user: object
    cached_role_versions: dict[str, int]
    current_role_versions: dict[str, int]
    codes: list[str] = field(default_factory=list)

    @property
    def is_stale(self) -> bool:
        """Check if any role version has changed since cache was built."""
        if set(self.cached_role_versions.keys()) != set(self.current_role_versions.keys()):
            return True
        return any(
            self.cached_role_versions.get(code) != self.current_role_versions.get(code)
            for code in self.current_role_versions
        )

    def allows_route(self, route_key: str) -> bool:
        """当前用户的码集合是否覆盖该接口。"""
        return bool(get_catalog().codes_for_route(route_key) & set(self.codes))
