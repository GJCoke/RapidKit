"""Unit tests for system plugin service functions."""

from dataclasses import dataclass, field
from unittest.mock import AsyncMock, MagicMock

import pytest

from plugin_system.services import (
    build_plugin_dependency_graph,
    build_plugin_status_list,
    derive_overall_health,
)


# ── Helpers ──────────────────────────────────────────────────────────


@dataclass
class _FakePluginManifest:
    name: str
    version: str = "1.0.0"
    required: bool = True
    dependencies: list = field(default_factory=list)


@dataclass
class _FakePluginDependency:
    name: str
    version: str | None = None


@dataclass
class _FakePluginMeta:
    register_ms: float = 10.0
    startup_ms: float = 5.0
    status: str = "loaded"


@dataclass
class _FakePluginError:
    phase: str = "import"
    message: str = "boom"
    caused_by: str | None = None


# ── derive_overall_health ────────────────────────────────────────────


class TestDeriveOverallHealth:
    def test_all_up_returns_healthy(self):
        assert derive_overall_health(["up", "up", "up"]) == "healthy"

    def test_any_down_returns_unhealthy(self):
        assert derive_overall_health(["up", "down", "up"]) == "unhealthy"

    def test_degraded_without_down_returns_degraded(self):
        assert derive_overall_health(["up", "degraded", "up"]) == "degraded"

    def test_down_takes_precedence_over_degraded(self):
        assert derive_overall_health(["down", "degraded", "up"]) == "unhealthy"

    def test_empty_returns_healthy(self):
        assert derive_overall_health([]) == "healthy"

    def test_all_down_returns_unhealthy(self):
        assert derive_overall_health(["down", "down"]) == "unhealthy"


# ── build_business_summary ───────────────────────────────────────────


class TestBuildBusinessSummary:
    @pytest.mark.asyncio
    async def test_returns_counts(self):
        from plugin_system.services import build_business_summary

        session = AsyncMock()
        result_mock = MagicMock()
        result_mock.scalar_one.return_value = 42
        session.execute.return_value = result_mock

        result = await build_business_summary(session, enable_celery=False)

        assert result["roles"] == 42
        assert result["menus"] == 42
        assert result["routers"] == 42
        assert result["scripts"] == 42
        assert result["schedules"] == 0

    @pytest.mark.asyncio
    async def test_celery_enabled_counts_schedules(self):
        from plugin_system.services import build_business_summary

        session = AsyncMock()
        result_mock = MagicMock()
        result_mock.scalar_one.return_value = 10
        session.execute.return_value = result_mock

        result = await build_business_summary(session, enable_celery=True)

        assert result["schedules"] == 10

    @pytest.mark.asyncio
    async def test_celery_count_failure_returns_zero(self):
        from plugin_system.services import build_business_summary

        call_count = 0

        async def _execute(stmt):
            nonlocal call_count
            call_count += 1
            # The 5th call is for schedule_periodic_tasks — raise
            if call_count == 5:
                raise RuntimeError("table missing")
            mock_result = MagicMock()
            mock_result.scalar_one.return_value = 7
            return mock_result

        session = AsyncMock()
        session.execute = _execute

        result = await build_business_summary(session, enable_celery=True)

        assert result["schedules"] == 0
        assert result["roles"] == 7


# ── build_plugin_status_list ─────────────────────────────────────────


class TestBuildPluginStatusList:
    def test_loaded_plugins(self):
        plugins = [
            _FakePluginManifest(name="auth", dependencies=["core"]),
            _FakePluginManifest(name="menu", dependencies=[_FakePluginDependency(name="auth")]),
        ]
        meta = {
            "auth": _FakePluginMeta(register_ms=12.0, startup_ms=3.0, status="loaded"),
            "menu": _FakePluginMeta(register_ms=8.0, startup_ms=2.0, status="loaded"),
        }

        items = build_plugin_status_list(plugins, meta, disabled=[], errors={})

        assert len(items) == 2
        assert items[0]["name"] == "auth"
        assert items[0]["status"] == "loaded"
        assert items[0]["dependencies"] == ["core"]
        assert items[0]["load_time_ms"] == 12.0
        assert items[1]["dependencies"] == ["auth"]

    def test_disabled_plugins(self):
        items = build_plugin_status_list([], {}, disabled=["old-plugin"], errors={})

        assert len(items) == 1
        assert items[0]["name"] == "old-plugin"
        assert items[0]["status"] == "disabled"

    def test_failed_plugins(self):
        error = _FakePluginError(phase="import", message="not found", caused_by=None)
        items = build_plugin_status_list([], {}, disabled=[], errors={"broken": error})

        assert len(items) == 1
        assert items[0]["name"] == "broken"
        assert items[0]["status"] == "failed"
        assert items[0]["error"]["phase"] == "import"
        assert items[0]["error"]["message"] == "not found"

    def test_mixed_plugins(self):
        plugins = [_FakePluginManifest(name="auth")]
        meta = {"auth": _FakePluginMeta()}
        error = _FakePluginError(phase="startup", message="timeout")

        items = build_plugin_status_list(
            plugins, meta, disabled=["legacy"], errors={"broken": error}
        )

        assert len(items) == 3
        names = [i["name"] for i in items]
        assert "auth" in names
        assert "legacy" in names
        assert "broken" in names

    def test_plugin_without_meta_defaults(self):
        plugins = [_FakePluginManifest(name="auth")]
        items = build_plugin_status_list(plugins, {}, disabled=[], errors={})

        assert items[0]["status"] == "loaded"
        assert items[0]["load_time_ms"] is None


# ── build_plugin_dependency_graph ────────────────────────────────────


class TestBuildPluginDependencyGraph:
    def test_nodes_and_edges(self):
        plugins = [
            _FakePluginManifest(name="auth", version="1.0.0", dependencies=["core"]),
            _FakePluginManifest(name="menu", dependencies=[_FakePluginDependency(name="auth")]),
        ]
        meta = {
            "auth": _FakePluginMeta(status="loaded"),
            "menu": _FakePluginMeta(status="loaded"),
        }

        graph = build_plugin_dependency_graph(plugins, meta, disabled=[], errors={})

        assert len(graph["nodes"]) == 2
        assert len(graph["edges"]) == 2
        edge_pairs = [(e["source"], e["target"]) for e in graph["edges"]]
        assert ("auth", "core") in edge_pairs
        assert ("menu", "auth") in edge_pairs

    def test_disabled_nodes(self):
        graph = build_plugin_dependency_graph([], {}, disabled=["old"], errors={})

        assert len(graph["nodes"]) == 1
        assert graph["nodes"][0]["name"] == "old"
        assert graph["nodes"][0]["status"] == "disabled"
        assert graph["nodes"][0]["required"] is False

    def test_failed_nodes(self):
        error = _FakePluginError()
        graph = build_plugin_dependency_graph([], {}, disabled=[], errors={"broken": error})

        assert len(graph["nodes"]) == 1
        assert graph["nodes"][0]["name"] == "broken"
        assert graph["nodes"][0]["status"] == "failed"

    def test_empty_graph(self):
        graph = build_plugin_dependency_graph([], {}, disabled=[], errors={})
        assert graph["nodes"] == []
        assert graph["edges"] == []
