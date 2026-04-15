"""PluginLoader 测试 — 拓扑排序、循环依赖检测、错误处理。"""

import pytest

from rapidkit_core.plugin import PluginManifest


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
