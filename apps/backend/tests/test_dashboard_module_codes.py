# apps/backend/tests/test_dashboard_module_codes.py
"""首页模块所需权限码与对应接口的权限声明保持一致。"""

from plugin_permission.catalog.loader import catalog_from_app
from plugin_permission.dashboard.services import collect_dashboard_modules

REQUIRED_ROUTES = {
    "dashboard.overview": ("GET:/api/v1/system/stats/operations-overview",),
    "dashboard.application-health": ("GET:/api/v1/system/stats/health",),
    "dashboard.infrastructure": ("GET:/api/v1/system/stats/infrastructure", "GET:/api/v1/system/stats/resources"),
    "dashboard.business": ("GET:/api/v1/system/stats/business",),
    "dashboard.activity": ("GET:/api/v1/system/activities",),
    "dashboard.trends": ("GET:/api/v1/users/stats/trend",),
    "dashboard.api-monitoring": (
        "GET:/api/v1/system/stats/api/distribution",
        "GET:/api/v1/system/stats/api/top",
        "GET:/api/v1/system/stats/api/trend",
    ),
}


def test_dashboard_modules_require_codes_of_declared_routes(loaded_app):
    _, bindings = catalog_from_app(loaded_app)
    expected = {
        key: tuple(sorted({bindings[route] for route in routes})) for key, routes in REQUIRED_ROUTES.items()
    }
    actual = {
        definition.key: tuple(sorted(definition.required_permissions))
        for definition in collect_dashboard_modules(loaded_app.state.plugins)
    }

    assert actual == expected, f"把各插件 DashboardModuleDef.required_permissions 改为：{expected}"
