"""Unit tests for menu service functions."""

from unittest.mock import MagicMock
from uuid import uuid4

from plugin_menu.route_services import build_route_tree, menu_to_route
from plugin_menu.services import filter_menu


class TestFilterMenu:
    def test_no_filters_still_has_parent_id_null(self):
        result = filter_menu(status=None, keyword="")
        # Always includes parent_id IS NULL
        assert len(result) == 1

    def test_status_filter(self):
        from rapidkit_common.enums import Status

        result = filter_menu(status=Status.ON, keyword="")
        assert len(result) == 2  # parent_id IS NULL + status

    def test_keyword_filter(self):
        result = filter_menu(status=None, keyword="dashboard")
        assert len(result) == 2  # parent_id IS NULL + keyword OR

    def test_keyword_escapes_wildcards(self):
        result = filter_menu(status=None, keyword="100%")
        assert len(result) == 2


class TestMenuToRoute:
    def _make_menu(self, **overrides):
        menu = MagicMock()
        menu.id = overrides.get("id", uuid4())
        menu.menu_name = overrides.get("menu_name", "Dashboard")
        menu.i18n_key = overrides.get("i18n_key", "route.dashboard")
        menu.icon = overrides.get("icon", "mdi:home")
        menu.icon_type = overrides.get("icon_type", None)
        menu.order = overrides.get("order", 1)
        menu.constant = overrides.get("constant", False)
        menu.hide_in_menu = overrides.get("hide_in_menu", False)
        menu.keep_alive = overrides.get("keep_alive", True)
        menu.href = overrides.get("href", None)
        menu.multi_tab = overrides.get("multi_tab", False)
        menu.fixed_index_in_tab = overrides.get("fixed_index_in_tab", None)
        menu.query = overrides.get("query", None)
        menu.route_name = overrides.get("route_name", "dashboard")
        menu.route_path = overrides.get("route_path", "/dashboard")
        menu.component = overrides.get("component", "layout.base$view.dashboard")
        return menu

    def test_basic_conversion(self):
        menu = self._make_menu()

        route = menu_to_route(menu)

        assert route.name == "dashboard"
        assert route.path == "/dashboard"
        assert route.meta.title == "Dashboard"
        assert route.meta.icon == "mdi:home"
        assert route.meta.local_icon is None

    def test_local_icon(self):
        from rapidkit_common.enums import MenuIconType

        menu = self._make_menu(icon="custom-icon", icon_type=MenuIconType.LOCAL)

        route = menu_to_route(menu)

        assert route.meta.icon is None
        assert route.meta.local_icon == "custom-icon"

    def test_no_icon(self):
        menu = self._make_menu(icon=None)

        route = menu_to_route(menu)

        assert route.meta.icon is None
        assert route.meta.local_icon is None


class TestBuildRouteTree:
    def _make_menu(self, id, parent_id=None, name="item"):
        menu = MagicMock()
        menu.id = id
        menu.parent_id = parent_id
        menu.menu_name = name
        menu.i18n_key = None
        menu.icon = None
        menu.icon_type = None
        menu.order = 0
        menu.constant = False
        menu.hide_in_menu = False
        menu.keep_alive = False
        menu.href = None
        menu.multi_tab = False
        menu.fixed_index_in_tab = None
        menu.query = None
        menu.route_name = name
        menu.route_path = f"/{name}"
        menu.component = f"view.{name}"
        return menu

    def test_empty_list(self):
        result = build_route_tree([])
        assert result == []

    def test_single_root(self):
        root_id = uuid4()
        menu = self._make_menu(root_id)

        result = build_route_tree([menu])

        assert len(result) == 1
        assert result[0].name == "item"

    def test_parent_child_relationship(self):
        root_id = uuid4()
        child_id = uuid4()
        root = self._make_menu(root_id, name="parent")
        child = self._make_menu(child_id, parent_id=root_id, name="child")

        result = build_route_tree([root, child])

        assert len(result) == 1
        assert result[0].children is not None
        assert len(result[0].children) == 1
        assert result[0].children[0].name == "child"

    def test_orphan_child_excluded(self):
        child_id = uuid4()
        orphan_parent = uuid4()
        child = self._make_menu(child_id, parent_id=orphan_parent, name="orphan")

        result = build_route_tree([child])

        assert len(result) == 0
