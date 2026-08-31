"""PluginManifest 数据类测试。"""

import pytest

from rapidkit_framework.plugin import DashboardModuleDef, PluginManifest


class TestPluginManifest:
    def test_default_values(self):
        m = PluginManifest(name="test", version="0.1.0")
        assert m.name == "test"
        assert m.version == "0.1.0"
        assert m.router is None
        assert m.models == []
        assert m.dependencies == []
        assert m.required is True
        assert m.on_startup == []
        assert m.on_shutdown == []

    def test_permission_def(self):
        from rapidkit_framework.plugin import PermissionDef

        p = PermissionDef(code="user:create", name="创建用户", description="允许创建新用户")
        assert p.code == "user:create"
        assert p.name == "创建用户"
        assert p.description == "允许创建新用户"

    def test_health_status(self):
        from rapidkit_framework.plugin import HealthStatus

        assert HealthStatus.HEALTHY.value == "healthy"
        assert HealthStatus.DEGRADED.value == "degraded"
        assert HealthStatus.UNHEALTHY.value == "unhealthy"

    def test_manifest_with_dependencies(self):
        m = PluginManifest(
            name="auth",
            version="1.0.0",
            dependencies=["core", "user"],
            required=False,
        )
        assert m.dependencies == ["core", "user"]
        assert m.required is False


def test_manifest_dashboard_modules_default_empty() -> None:
    assert PluginManifest(name="demo", version="1.0.0").dashboard_modules == []


def test_dashboard_module_def_keeps_stable_security_metadata() -> None:
    definition = DashboardModuleDef(
        key="worker.dashboard.queue-health",
        required_permissions=("GET:/api/v1/workers",),
        realtime_topics=("dashboard:worker_status",),
    )

    assert definition.key == "worker.dashboard.queue-health"
    assert definition.required_permissions == ("GET:/api/v1/workers",)


def test_dashboard_module_def_rejects_empty_key() -> None:
    with pytest.raises(ValueError, match="key"):
        DashboardModuleDef(key="", required_permissions=("GET:/api/v1/workers",))


def test_dashboard_module_def_rejects_duplicate_permissions() -> None:
    with pytest.raises(ValueError, match="unique"):
        DashboardModuleDef(
            key="dashboard.overview",
            required_permissions=("GET:/api/v1/users", "GET:/api/v1/users"),
        )
