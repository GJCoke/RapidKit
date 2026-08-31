"""Dashboard capability resolution tests."""

import pytest
from plugin_permission.dashboard.services import collect_dashboard_modules, resolve_capabilities
from rapidkit_framework.plugin import DashboardModuleDef, PluginManifest


def test_requires_every_declared_permission() -> None:
    definitions = [
        DashboardModuleDef(
            key="dashboard.overview",
            required_permissions=(
                "GET:/api/v1/users/stats/summary",
                "GET:/api/v1/tasks/stats/summary",
            ),
        )
    ]

    result = resolve_capabilities(
        definitions,
        {"GET:/api/v1/users/stats/summary"},
        is_admin=False,
        role_versions={"MEMBER": 1},
    )

    assert result.allowed_modules == []


def test_admin_receives_every_registered_module_in_stable_order() -> None:
    definitions = [
        DashboardModuleDef(key="dashboard.trends", required_permissions=("GET:/trend",)),
        DashboardModuleDef(key="dashboard.business", required_permissions=("GET:/business",)),
    ]

    result = resolve_capabilities(definitions, set(), is_admin=True, role_versions={})

    assert result.allowed_modules == ["dashboard.business", "dashboard.trends"]


def test_revision_is_stable_for_equivalent_input_order() -> None:
    definitions = [DashboardModuleDef(key="dashboard.business", required_permissions=("GET:/business",))]

    first = resolve_capabilities(
        definitions,
        {"GET:/business", "GET:/unused"},
        is_admin=False,
        role_versions={"B": 2, "A": 1},
    )
    second = resolve_capabilities(
        list(reversed(definitions)),
        {"GET:/unused", "GET:/business"},
        is_admin=False,
        role_versions={"A": 1, "B": 2},
    )

    assert first.revision == second.revision


def test_duplicate_module_keys_are_rejected() -> None:
    definitions = [
        DashboardModuleDef(key="dashboard.business", required_permissions=("GET:/one",)),
        DashboardModuleDef(key="dashboard.business", required_permissions=("GET:/two",)),
    ]

    with pytest.raises(ValueError, match="duplicate"):
        resolve_capabilities(definitions, set(), is_admin=True, role_versions={})


def test_collects_module_definitions_from_loaded_manifests() -> None:
    definition = DashboardModuleDef(key="dashboard.business", required_permissions=("GET:/business",))
    manifests = [
        PluginManifest(name="one", version="1.0.0"),
        PluginManifest(name="two", version="1.0.0", dashboard_modules=[definition]),
    ]

    assert collect_dashboard_modules(manifests) == [definition]


def test_core_plugins_declare_the_seven_dashboard_module_keys() -> None:
    from plugin_monitoring import register as register_monitoring
    from plugin_system import register as register_system
    from plugin_user import register as register_user

    manifests = [register_system(), register_monitoring(), register_user()]
    keys = {definition.key for definition in collect_dashboard_modules(manifests)}

    assert keys == {
        "dashboard.overview",
        "dashboard.application-health",
        "dashboard.infrastructure",
        "dashboard.business",
        "dashboard.api-monitoring",
        "dashboard.trends",
        "dashboard.activity",
    }
