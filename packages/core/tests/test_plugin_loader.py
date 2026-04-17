"""PluginLoader 测试 — 拓扑排序、循环依赖检测、错误处理。"""

from pathlib import Path
from textwrap import dedent
from unittest.mock import MagicMock

import pytest
from rapidkit_core.loader import PluginLoadError, discover_and_load_plugins
from rapidkit_core.plugin import PluginError, PluginLoadResult, PluginManifest


class TestTopologicalSort:
    def test_dependency_order(self):
        """B 依赖 A → 排序返回 [A, B]。"""
        from rapidkit_core.loader import topological_sort

        a = PluginManifest(name="a", version="1.0")
        b = PluginManifest(name="b", version="1.0", dependencies=["a"])
        result = topological_sort([a, b])
        names = [m.name for m in result]
        assert names.index("a") < names.index("b")

    def test_no_dependencies(self):
        """无依赖时保持原序。"""
        from rapidkit_core.loader import topological_sort

        a = PluginManifest(name="a", version="1.0")
        b = PluginManifest(name="b", version="1.0")
        result = topological_sort([a, b])
        assert len(result) == 2

    def test_circular_dependency_raises(self):
        """循环依赖 → 抛出 PluginLoadError。"""
        from rapidkit_core.loader import PluginLoadError, topological_sort

        a = PluginManifest(name="a", version="1.0", dependencies=["b"])
        b = PluginManifest(name="b", version="1.0", dependencies=["a"])
        with pytest.raises(PluginLoadError, match="[Cc]ircular"):
            topological_sort([a, b])

    def test_missing_dependency_raises(self):
        """依赖不存在 → 抛出 PluginLoadError。"""
        from rapidkit_core.loader import PluginLoadError, topological_sort

        a = PluginManifest(name="a", version="1.0", dependencies=["nonexistent"])
        with pytest.raises(PluginLoadError, match="nonexistent"):
            topological_sort([a])

    def test_complex_dag(self):
        """D → B → A, D → C → A → 排序 A 在 B,C 前，B,C 在 D 前。"""
        from rapidkit_core.loader import topological_sort

        a = PluginManifest(name="a", version="1.0")
        b = PluginManifest(name="b", version="1.0", dependencies=["a"])
        c = PluginManifest(name="c", version="1.0", dependencies=["a"])
        d = PluginManifest(name="d", version="1.0", dependencies=["b", "c"])
        result = topological_sort([d, c, b, a])
        names = [m.name for m in result]
        assert names.index("a") < names.index("b")
        assert names.index("a") < names.index("c")
        assert names.index("b") < names.index("d")
        assert names.index("c") < names.index("d")


class TestPluginLoadResult:
    def test_create_with_defaults(self):
        """PluginLoadResult can be created with just plugins."""
        from rapidkit_core.plugin import PluginLoadResult, PluginManifest

        m = PluginManifest(name="a", version="1.0")
        result = PluginLoadResult(plugins=[m])
        assert result.plugins == [m]
        assert result.disabled == []
        assert result.errors == {}

    def test_create_with_all_fields(self):
        """PluginLoadResult carries disabled and errors info."""
        from rapidkit_core.plugin import PluginLoadResult, PluginManifest

        m = PluginManifest(name="a", version="1.0")
        broken_err = PluginError(plugin_name="broken", phase="import", message="No module named 'broken'")
        result = PluginLoadResult(
            plugins=[m],
            disabled=["worker", "schedule"],
            errors={"broken": broken_err},
        )
        assert result.disabled == ["worker", "schedule"]
        assert result.errors["broken"].message == "No module named 'broken'"


def _make_entry_point(name: str, manifest: PluginManifest) -> MagicMock:
    """Create a mock entry point whose .load() returns a register function."""
    ep = MagicMock()
    ep.name = name
    ep.load.return_value = lambda: manifest
    return ep


def _make_failing_entry_point(name: str, error: Exception) -> MagicMock:
    """Create a mock entry point whose .load() raises an error."""
    ep = MagicMock()
    ep.name = name
    ep.load.side_effect = error
    return ep


class TestDiscoverAndLoadPlugins:
    def test_discovers_from_entry_points(self, monkeypatch: pytest.MonkeyPatch):
        """Entry points are discovered and loaded in dependency order."""
        a = PluginManifest(name="a", version="1.0")
        b = PluginManifest(name="b", version="1.0", dependencies=["a"])

        eps = [_make_entry_point("a", a), _make_entry_point("b", b)]
        monkeypatch.setattr("rapidkit_core.loader._get_entry_points", lambda: eps)

        result = discover_and_load_plugins()
        assert isinstance(result, PluginLoadResult)
        names = [p.name for p in result.plugins]
        assert names.index("a") < names.index("b")
        assert result.disabled == []
        assert result.errors == {}

    def test_config_disables_plugin(self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path):
        """Plugins disabled in config are not loaded."""
        a = PluginManifest(name="a", version="1.0")
        b = PluginManifest(name="b", version="1.0")

        eps = [_make_entry_point("a", a), _make_entry_point("b", b)]
        monkeypatch.setattr("rapidkit_core.loader._get_entry_points", lambda: eps)

        config_path = tmp_path / "plugins.toml"
        config_path.write_text(
            dedent("""\
            [plugins.b]
            enabled = false
        """)
        )

        result = discover_and_load_plugins(config_path=config_path)
        names = [p.name for p in result.plugins]
        assert "a" in names
        assert "b" not in names
        assert "b" in result.disabled

    def test_required_plugin_failure_raises(self, monkeypatch: pytest.MonkeyPatch):
        """Required plugin load failure raises PluginLoadError."""
        ep = _make_failing_entry_point("broken", ImportError("no module"))
        monkeypatch.setattr("rapidkit_core.loader._get_entry_points", lambda: [ep])

        with pytest.raises(PluginLoadError, match="broken"):
            discover_and_load_plugins()

    def test_non_required_plugin_failure_records_error(self, monkeypatch: pytest.MonkeyPatch):
        """Non-required plugin load failure is recorded in errors, not raised."""
        good = PluginManifest(name="good", version="1.0")

        def bad_register():
            raise ImportError("missing lib")

        ep_good = _make_entry_point("good", good)
        ep_bad = MagicMock()
        ep_bad.name = "bad"
        ep_bad.load.return_value = bad_register

        monkeypatch.setattr("rapidkit_core.loader._get_entry_points", lambda: [ep_good, ep_bad])
        result = discover_and_load_plugins(non_required_names={"bad"})
        assert len(result.plugins) == 1
        assert result.plugins[0].name == "good"
        assert "bad" in result.errors
        assert result.errors["bad"].phase == "import"

    def test_no_entry_points_returns_empty(self, monkeypatch: pytest.MonkeyPatch):
        """No entry points discovered → empty result."""
        monkeypatch.setattr("rapidkit_core.loader._get_entry_points", lambda: [])

        result = discover_and_load_plugins()
        assert result.plugins == []
        assert result.disabled == []
        assert result.errors == {}

    def test_no_config_file_enables_all(self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path):
        """Missing config file → all discovered plugins enabled."""
        a = PluginManifest(name="a", version="1.0")
        eps = [_make_entry_point("a", a)]
        monkeypatch.setattr("rapidkit_core.loader._get_entry_points", lambda: eps)

        result = discover_and_load_plugins(config_path=tmp_path / "nope.toml")
        assert len(result.plugins) == 1
        assert result.disabled == []

    def test_entry_point_returns_non_manifest_raises(self, monkeypatch: pytest.MonkeyPatch):
        """Entry point returning non-PluginManifest raises PluginLoadError."""
        ep = MagicMock()
        ep.name = "bad"
        ep.load.return_value = lambda: "not a manifest"
        monkeypatch.setattr("rapidkit_core.loader._get_entry_points", lambda: [ep])

        with pytest.raises(PluginLoadError, match="PluginManifest"):
            discover_and_load_plugins()


class TestEntryPointsIntegration:
    """集成测试 — 验证实际安装的插件可通过 entry points 发现和加载。"""

    def test_real_entry_points_discoverable(self):
        """至少能发现 auth 插件（它是无条件安装的）。"""
        from rapidkit_core.loader import _get_entry_points

        eps = _get_entry_points()
        names = [ep.name for ep in eps]
        assert "auth" in names, f"Expected 'auth' in entry points, got: {names}"

    def test_real_plugins_load_successfully(self):
        """所有发现的插件都能成功调用 register()。"""
        from rapidkit_core.loader import _get_entry_points
        from rapidkit_core.plugin import PluginManifest

        eps = _get_entry_points()
        for ep in eps:
            register_fn = ep.load()
            manifest = register_fn()
            assert isinstance(manifest, PluginManifest), f"Plugin '{ep.name}' returned {type(manifest)}"
            assert manifest.name == ep.name, f"Plugin entry point name '{ep.name}' != manifest name '{manifest.name}'"


class TestDependencyOverridesIntegration:
    """Integration: discover_and_load_plugins + apply_dependency_overrides."""

    def test_auth_plugin_declares_overrides(self):
        """Auth plugin's manifest includes dependency_overrides."""
        from rapidkit_core.loader import _get_entry_points

        eps = _get_entry_points()
        auth_ep = next((ep for ep in eps if ep.name == "auth"), None)
        assert auth_ep is not None, "auth entry point not found"

        manifest = auth_ep.load()()
        assert len(manifest.dependency_overrides) == 2, (
            f"Expected 2 dependency_overrides, got {len(manifest.dependency_overrides)}"
        )

    def test_apply_overrides_to_mock_app(self):
        """apply_dependency_overrides populates app.dependency_overrides."""
        from rapidkit_core.loader import apply_dependency_overrides

        async def placeholder():
            pass

        async def real():
            pass

        m = PluginManifest(name="test", version="1.0", dependency_overrides={placeholder: real})

        app = MagicMock()
        app.dependency_overrides = {}
        apply_dependency_overrides(app, [m])

        assert app.dependency_overrides[placeholder] is real


class TestMiddlewareMountingIntegration:
    """Integration: mount_plugin_middlewares with mock app."""

    def test_mount_multiple_plugins_middlewares(self):
        """Middlewares from multiple plugins are mounted in correct order."""
        from rapidkit_core.loader import mount_plugin_middlewares
        from rapidkit_core.plugin import MiddlewareDef

        class MW1:
            pass

        class MW2:
            pass

        plugins = [
            PluginManifest(name="a", version="1.0", middlewares=[MiddlewareDef(cls=MW1, order=5)]),
            PluginManifest(name="b", version="1.0", middlewares=[MiddlewareDef(cls=MW2, order=-5)]),
        ]

        app = MagicMock()
        mount_plugin_middlewares(app, plugins)

        calls = app.add_middleware.call_args_list
        assert len(calls) == 2
        # Descending order: MW1 (order=5) mounted first, MW2 (order=-5) mounted last
        assert calls[0][0][0] is MW1
        assert calls[1][0][0] is MW2
