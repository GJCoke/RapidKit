"""
RBAC (route-level) permission checking.

Provides a pure function for route-key permission matching
and the PermissionDenied exception type.

Author : Coke
Date   : 2026-05-08
"""


class PermissionDenied(Exception):
    """Raised when RBAC check fails."""


def check_route_permission(
    permissions: list[str],
    route_key: str,
    is_admin: bool,
) -> bool:
    """
    Check if a user has permission to access the given route.

    Args:
        permissions: List of allowed route keys from the user's cached permissions.
        route_key: The canonical route key for the current request.
        is_admin: Whether the user is an admin (bypasses all checks).

    Returns:
        True if access is allowed.

    Raises:
        PermissionDenied: If the route_key is not in the permissions list.
    """
    if is_admin:
        return True

    if route_key not in permissions:
        raise PermissionDenied(f"Route '{route_key}' not in user permissions")

    return True
