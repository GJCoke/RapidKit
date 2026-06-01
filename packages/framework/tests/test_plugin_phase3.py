"""Phase 3 — version compatibility, structured errors, load time tracking."""

from unittest.mock import MagicMock

import pytest
from rapidkit_framework.loader import (
    PluginLoadError,
    _check_version_constraints,
    _resolve_dependency_name,
    discover_and_load_plugins,
)
from rapidkit_framework.plugin import (
    PluginDependency,
    PluginError,
    PluginLoadResult,
    PluginManifest,
    PluginMeta,
)


class TestPluginDependency:
    def test_create_with_version(self):
        dep = PluginDependency(name="auth", version=">=1.0,<3.0")
        assert dep.name == "auth"
        assert dep.version == ">=1.0,<3.0"

    def test_create_name_only(self):
        dep = PluginDependency(name="auth")
        assert dep.version is None


class TestPluginError:
    def test_create_basic(self):
        err = PluginError(plugin_name="broken", phase="import", message="No module")
        assert err.plugin_name == "broken"
        assert err.phase == "import"
        assert err.caused_by is None

    def test_create_with_caused_by(self):
        err = PluginError(
            plugin_name="user",
            phase="version_check",
            message="Requires auth >=2.0",
            caused_by="auth",
        )
        assert err.caused_by == "auth"


class TestPluginMeta:
    def test_defaults(self):
        meta = PluginMeta()
        assert meta.register_ms == 0
        assert meta.startup_ms == 0
        assert meta.status == "loaded"

    def test_custom_values(self):
        meta = PluginMeta(register_ms=12.5, startup_ms=45.0, status="degraded")
        assert meta.register_ms == 12.5
        assert meta.status == "degraded"


class TestPluginManifestDependencies:
    def test_str_dependencies_still_work(self):
        m = PluginManifest(name="test", version="1.0", dependencies=["auth", "menu"])
        assert m.dependencies == ["auth", "menu"]

    def test_mixed_dependencies(self):
        m = PluginManifest(
            name="test",
            version="1.0",
            dependencies=["auth", PluginDependency(name="menu", version=">=1.0")],
        )
        assert len(m.dependencies) == 2
        assert m.dependencies[0] == "auth"
        assert isinstance(m.dependencies[1], PluginDependency)


class TestPluginLoadResultPhase3:
    def test_errors_with_plugin_error(self):
        err = PluginError(plugin_name="bad", phase="import", message="fail")
        result = PluginLoadResult(
            plugins=[],
            errors={"bad": err},
        )
        assert result.errors["bad"].phase == "import"

    def test_meta_field(self):
        meta = PluginMeta(register_ms=10.0)
        result = PluginLoadResult(
            plugins=[],
            meta={"auth": meta},
        )
        assert result.meta["auth"].register_ms == 10.0


class TestResolveDependencyName:
    def test_str_dependency(self):
        assert _resolve_dependency_name("auth") == "auth"

    def test_plugin_dependency(self):
        dep = PluginDependency(name="menu", version=">=1.0")
        assert _resolve_dependency_name(dep) == "menu"


class TestCheckVersionConstraints:
    def test_no_constraints_passes(self):
        manifests = [
            PluginManifest(name="auth", version="0.1.0"),
            PluginManifest(name="user", version="0.1.0", dependencies=["auth"]),
        ]
        errors = _check_version_constraints(manifests)
        assert errors == {}

    def test_satisfied_constraint_passes(self):
        manifests = [
            PluginManifest(name="auth", version="1.5.0"),
            PluginManifest(
                name="user",
                version="0.1.0",
                dependencies=[
                    PluginDependency(name="auth", version=">=1.0,<3.0"),
                ],
            ),
        ]
        errors = _check_version_constraints(manifests)
        assert errors == {}

    def test_unsatisfied_constraint_required_raises(self):
        manifests = [
            PluginManifest(name="auth", version="0.5.0"),
            PluginManifest(
                name="user",
                version="0.1.0",
                required=True,
                dependencies=[
                    PluginDependency(name="auth", version=">=1.0"),
                ],
            ),
        ]
        with pytest.raises(PluginLoadError, match="version"):
            _check_version_constraints(manifests)

    def test_unsatisfied_constraint_non_required_skipped(self):
        manifests = [
            PluginManifest(name="auth", version="0.5.0"),
            PluginManifest(
                name="user",
                version="0.1.0",
                required=False,
                dependencies=[
                    PluginDependency(name="auth", version=">=1.0"),
                ],
            ),
        ]
        errors = _check_version_constraints(manifests)
        assert "user" in errors
        assert errors["user"].phase == "version_check"

    def test_none_version_in_dependency_skips_check(self):
        manifests = [
            PluginManifest(name="auth", version="0.1.0"),
            PluginManifest(
                name="user",
                version="0.1.0",
                dependencies=[
                    PluginDependency(name="auth", version=None),
                ],
            ),
        ]
        errors = _check_version_constraints(manifests)
        assert errors == {}


class TestCascadingFailure:
    def test_non_required_failure_cascades_to_dependents(self, monkeypatch):
        """When b (non-required) fails, c that depends on b also fails."""
        a = PluginManifest(name="a", version="1.0")
        c = PluginManifest(name="c", version="1.0", required=False, dependencies=["b"])

        a_ep = MagicMock()
        a_ep.name = "a"
        a_ep.load.return_value = lambda: a

        b_ep = MagicMock()
        b_ep.name = "b"
        b_ep.load.side_effect = ImportError("missing lib")

        c_ep = MagicMock()
        c_ep.name = "c"
        c_ep.load.return_value = lambda: c

        monkeypatch.setattr("rapidkit_framework.loader._get_entry_points", lambda: [a_ep, b_ep, c_ep])

        result = discover_and_load_plugins(non_required_names={"b", "c"})
        assert len(result.plugins) == 1
        assert result.plugins[0].name == "a"
        assert "b" in result.errors
        assert "c" in result.errors
        assert result.errors["c"].caused_by == "b"

    def test_load_time_tracking(self, monkeypatch):
        """Plugin register time is tracked in meta."""
        a = PluginManifest(name="a", version="1.0")
        a_ep = MagicMock()
        a_ep.name = "a"
        a_ep.load.return_value = lambda: a

        monkeypatch.setattr("rapidkit_framework.loader._get_entry_points", lambda: [a_ep])

        result = discover_and_load_plugins()
        assert "a" in result.meta
        assert result.meta["a"].register_ms >= 0
