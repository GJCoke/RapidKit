"""Security policy for the legacy unscoped Dashboard realtime stream."""

from typing import Protocol


class AdminLike(Protocol):
    is_admin: bool


def is_dashboard_realtime_allowed(user: AdminLike) -> bool:
    """Only super administrators may consume the unscoped broadcast stream."""
    return user.is_admin
