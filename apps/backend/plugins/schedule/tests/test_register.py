"""plugin_schedule register() 测试。"""

import ast
import unittest
from pathlib import Path


class TestScheduleRegister(unittest.TestCase):
    def test_register_returns_manifest(self):
        from plugin_schedule import register

        m = register()
        assert m.name == "schedule"
        assert m.version == "0.1.0"

    def test_router_exists(self):
        from plugin_schedule import register

        m = register()
        assert m.router is not None

    def test_router_has_routes(self):
        from plugin_schedule import register

        m = register()
        routes = [r.path for r in m.router.routes]
        assert "/schedules" in routes or "/schedules/" in routes
        assert "/schedules/{schedule_id}" in routes

    def test_models_registered(self):
        """schedule 插件注册了 4 个调度相关 model。"""
        from plugin_schedule import register

        m = register()
        model_names = {cls.__name__ for cls in m.models}
        assert model_names == {"IntervalSchedule", "CrontabSchedule", "SolarSchedule", "PeriodicTask"}

    def test_no_cross_plugin_imports(self):
        plugin_src = Path(__file__).resolve().parent.parent / "src" / "plugin_schedule"
        violations = []
        for py_file in plugin_src.rglob("*.py"):
            tree = ast.parse(py_file.read_text())
            for node in ast.walk(tree):
                if isinstance(node, ast.ImportFrom) and node.module:
                    if node.module.startswith("plugin_") and not node.module.startswith("plugin_schedule"):
                        violations.append(f"{py_file.name}: {node.module}")
        assert violations == [], f"Cross-plugin imports found: {violations}"
