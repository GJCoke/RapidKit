from plugin_menu.models import Menu
from rapidkit_common.enums import MenuType
from src._menu_seeds import build_menus

# 与总索引 C7 菜单 → Menu.permission 对照表一致。
EXPECTED_MENU_PERMISSIONS = {
    "home": "dashboard:read",
    "manage_user": "user:read",
    "manage_user-detail": "user:read",
    "manage_role": "role:read",
    "manage_menu": "menu:read",
    "manage_department": "department:read",
    "manage_audit-log": "audit-log:read",
    "queue_dashboard": "worker:read",
    "queue_schedule": "schedule:read",
    "queue_task": "task:read",
    "monitoring_api": "monitoring:read",
    "monitoring_plugin": "plugin:read",
    "socketio_chat": "socketio:read",
    "socketio_debug": "socketio:read",
    "socketio_instrument": "socketio:read",
    "notification_manage_templates": "notification-template:read",
    "notification_manage_announcements": "notification:read",
    "notification_manage_deliveries": "notification-delivery:read",
}


def test_seed_page_menus_declare_expected_permission() -> None:
    pages = {
        menu.route_name: menu.permission
        for menu in build_menus()
        if menu.menu_type == MenuType.MENU and not menu.constant
    }
    assert pages == EXPECTED_MENU_PERMISSIONS


def test_directories_and_constant_routes_have_no_permission() -> None:
    assert all(
        menu.permission is None for menu in build_menus() if menu.menu_type == MenuType.DIRECTORY or menu.constant
    )


def test_menu_model_no_longer_stores_buttons_or_interfaces() -> None:
    assert "buttons" not in Menu.model_fields
    assert "interfaces" not in Menu.model_fields


def test_login_seed_includes_password_setup_and_reset_modules() -> None:
    login = next(menu for menu in build_menus() if menu.route_name == "login")

    assert login.route_path == (
        "/login/:module(pwd-login|code-login|register|reset-pwd|bind-wechat|set-password|reset-password)?"
    )


def test_notification_management_seed_has_ordered_route_tree() -> None:
    by_name = {menu.route_name: menu for menu in build_menus()}

    parent = by_name["notificationManage"]
    assert parent.order == 9
    assert parent.parent_id is None
    assert parent.component == "layout.base"
    assert "_" not in parent.route_name
    for route_name in (
        "notification_manage_templates",
        "notification_manage_announcements",
        "notification_manage_deliveries",
    ):
        assert by_name[route_name].parent_id == parent.id


def test_user_detail_seed_registers_hidden_authorized_page() -> None:
    by_name = {menu.route_name: menu for menu in build_menus()}
    detail = by_name["manage_user-detail"]
    assert detail.parent_id == by_name["manage"].id
    assert detail.route_path == "/manage/user-detail/:id"
    assert detail.component == "view.manage_user-detail"
    assert detail.hide_in_menu and not detail.constant
    assert detail.permission == "user:read"


def test_permission_management_menus_are_retired():
    names = {menu.route_name for menu in build_menus()}
    assert not names & {"manage_permission-package", "manage_permission-extension"}
