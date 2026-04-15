"""PluginManifest 数据类测试。"""


class TestPluginManifest:
    def test_default_values(self):
        from rapidkit_core.plugin import PluginManifest

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
        from rapidkit_core.plugin import PermissionDef

        p = PermissionDef(code="user:create", name="创建用户", description="允许创建新用户")
        assert p.code == "user:create"
        assert p.name == "创建用户"
        assert p.description == "允许创建新用户"

    def test_health_status(self):
        from rapidkit_core.plugin import HealthStatus

        assert HealthStatus.HEALTHY.value == "healthy"
        assert HealthStatus.DEGRADED.value == "degraded"
        assert HealthStatus.UNHEALTHY.value == "unhealthy"

    def test_manifest_with_dependencies(self):
        from rapidkit_core.plugin import PluginManifest

        m = PluginManifest(
            name="auth",
            version="1.0.0",
            dependencies=["core", "user"],
            required=False,
        )
        assert m.dependencies == ["core", "user"]
        assert m.required is False
