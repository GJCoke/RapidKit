# apps/backend/plugins/permission/tests/test_legacy_routes.py
"""旧码对照表与过渡别名测试。"""

import re

from plugin_permission.legacy_routes import LEGACY_BUTTON_CODES, LEGACY_MENU_CODES

CODE_PATTERN = re.compile(r"^[a-z][a-z0-9-]*:[a-z][a-z0-9-]*$")


def test_mapping_targets_follow_code_format():
    for target in [*LEGACY_BUTTON_CODES.values(), *LEGACY_MENU_CODES.values()]:
        assert CODE_PATTERN.match(target), target


def test_button_table_matches_index_c7():
    assert LEGACY_BUTTON_CODES["manage_user:password"] == "user:reset-password"
    assert LEGACY_BUTTON_CODES["manage_role:permission"] == "role:grant"
    assert LEGACY_BUTTON_CODES["queue_dashboard:workerControl"] == "worker:control"
    assert not any(code.startswith("script:") for code in LEGACY_BUTTON_CODES.values())
    assert len(LEGACY_BUTTON_CODES) == 26


def test_menu_table_matches_index_c7():
    assert LEGACY_MENU_CODES["home"] == "dashboard:read"
    assert LEGACY_MENU_CODES["manage_user-detail"] == "user:read"
    assert LEGACY_MENU_CODES["socketio_debug"] == "socketio:read"
    assert LEGACY_MENU_CODES["notification_manage_deliveries"] == "notification-delivery:read"
    assert len(LEGACY_MENU_CODES) == 20


def test_transition_helpers_are_removed():
    from plugin_permission import legacy_routes

    assert not hasattr(legacy_routes, "legacy_button_aliases")
    assert not hasattr(legacy_routes, "set_legacy_route_keys")
