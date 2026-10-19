import pytest
from plugin_menu.models import Menu
from src._menu_seeds import build_menus
from src.sync_notification_menus import build_missing_notification_menus


def test_adds_only_notification_tree_and_keeps_permission_metadata():
    unrelated = Menu(menu_name="Custom", route_name="custom", route_path="/custom")
    missing = build_missing_notification_menus([unrelated])
    assert len(missing) == 4
    root = next(menu for menu in missing if menu.route_name == "notificationManage")
    assert root.parent_id is None
    assert root.component == "layout.base"
    children = [menu for menu in missing if menu is not root]
    assert all(menu.parent_id == root.id for menu in children)
    assert all(menu.permission for menu in children)
    assert unrelated.menu_name == "Custom"


def test_reuses_existing_parent_id_and_preserves_custom_configuration():
    root = next(menu for menu in build_menus() if menu.route_name == "notificationManage")
    root.menu_name = "Custom notifications"
    root.order = 42
    missing = build_missing_notification_menus([root])
    assert len(missing) == 3
    assert all(menu.parent_id == root.id for menu in missing)
    assert root.menu_name == "Custom notifications"
    assert root.order == 42
    assert build_missing_notification_menus([root, *missing]) == []


def test_partial_install_does_not_duplicate_existing_child():
    menus = [menu for menu in build_menus() if menu.route_name.startswith("notification")]
    root = next(menu for menu in menus if menu.route_name == "notificationManage")
    child = next(menu for menu in menus if menu.route_name == "notification_manage_templates")
    child.icon = "custom-icon"
    missing = build_missing_notification_menus([root, child])
    assert {menu.route_name for menu in missing} == {
        "notification_manage_announcements",
        "notification_manage_deliveries",
    }
    assert child.icon == "custom-icon"


def test_rejects_conflicting_path_instead_of_creating_duplicate_navigation():
    conflict = Menu(menu_name="Custom", route_name="custom", route_path="/notification/manage")
    with pytest.raises(ValueError, match="/notification/manage"):
        build_missing_notification_menus([conflict])
