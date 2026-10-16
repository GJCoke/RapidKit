from src._menu_seeds import build_menus


def test_login_seed_includes_password_setup_and_reset_modules() -> None:
    login = next(menu for menu in build_menus() if menu.route_name == "login")

    assert login.route_path == (
        "/login/:module(pwd-login|code-login|register|reset-pwd|bind-wechat|set-password|reset-password)?"
    )


def test_notification_management_seed_has_ordered_route_tree_and_permissions() -> None:
    menus = build_menus()
    by_name = {menu.route_name: menu for menu in menus}

    parent = by_name["notificationManage"]
    assert parent.order == 9
    assert parent.parent_id is None
    assert parent.component == "layout.base"
    assert "_" not in parent.route_name

    expected_interfaces = {
        "notification_manage_templates": "GET:/api/v1/admin/notification-templates",
        "notification_manage_announcements": "GET:/api/v1/admin/notifications",
        "notification_manage_deliveries": "GET:/api/v1/admin/notification-deliveries",
    }
    for route_name, list_permission in expected_interfaces.items():
        child = by_name[route_name]
        assert child.parent_id == parent.id
        assert list_permission in child.interfaces


def test_user_detail_seed_registers_hidden_authorized_page() -> None:
    by_name = {menu.route_name: menu for menu in build_menus()}
    detail = by_name["manage_user-detail"]
    assert detail.parent_id == by_name["manage"].id
    assert detail.route_path == "/manage/user-detail/:id"
    assert detail.component == "view.manage_user-detail"
    assert detail.hide_in_menu and not detail.constant
    assert detail.interfaces == ["GET:/api/v1/users/{user_id}"]
