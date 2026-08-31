"""Dashboard realtime security policy tests."""

from plugin_system.realtime_access import is_dashboard_realtime_allowed


class User:
    def __init__(self, is_admin: bool) -> None:
        self.is_admin = is_admin


def test_only_super_admin_can_connect_to_unscoped_dashboard_stream() -> None:
    assert is_dashboard_realtime_allowed(User(is_admin=True)) is True
    assert is_dashboard_realtime_allowed(User(is_admin=False)) is False
