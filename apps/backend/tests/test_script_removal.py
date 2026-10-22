"""脚本业务退役后，加载应用和首页不再依赖脚本插件。"""

import importlib.metadata
import importlib.util

from plugin_permission.catalog.loader import catalog_from_app
from plugin_system.dashboard.schemas import BusinessSummary
from rapidkit_core.config import settings
from src._menu_seeds import build_menus


def test_script_plugin_is_uninstalled():
    assert importlib.util.find_spec("plugin_script") is None
    assert "script" not in {entry.name for entry in importlib.metadata.entry_points(group="rapidkit.plugins")}
    assert not hasattr(settings, "SCRIPT_EXEC_TIMEOUT")
    assert not hasattr(settings, "SCRIPT_EXEC_MAX_OUTPUT")


def test_script_routes_permissions_and_models_are_absent(loaded_app):
    catalog, _ = catalog_from_app(loaded_app)
    assert "script" not in {manifest.name for manifest in loaded_app.state.plugins}
    assert not any(code.startswith("script:") for code in catalog.codes)
    assert not any(getattr(route, "path", "").startswith("/api/v1/scripts") for route in loaded_app.routes)
    schema = loaded_app.openapi()
    assert not any(name.startswith("Script") for name in schema["components"]["schemas"])


def test_script_menu_and_business_count_are_absent():
    assert "script" not in {menu.route_name for menu in build_menus()}
    assert "scripts" not in BusinessSummary.model_fields
