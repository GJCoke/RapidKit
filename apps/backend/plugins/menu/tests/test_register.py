"""plugin_menu register() 测试。"""

import ast
import unittest
from pathlib import Path


class TestMenuRegister(unittest.TestCase):
    def test_register_returns_manifest(self):
        from plugin_menu import register

        m = register()
        assert m.name == "menu"
        assert m.version == "0.1.0"

    def test_router_exists(self):
        from plugin_menu import register

        m = register()
        assert m.router is not None

    def test_router_has_menu_routes(self):
        from plugin_menu import register

        m = register()
        routes = [r.path for r in m.router.routes]
        assert "/manage/menus" in routes or "/manage/menus/" in routes

    def test_router_has_route_routes(self):
        from plugin_menu import register

        m = register()
        routes = [r.path for r in m.router.routes]
        assert "/route/constant" in routes
        assert "/route/user" in routes
        assert "/route/exist" in routes

    def test_models_contains_menu(self):
        from plugin_menu import register
        from plugin_menu.models import Menu

        m = register()
        assert Menu in m.models

    def test_no_cross_plugin_imports(self):
        """plugin_menu 允许导入 plugin_auth（声明依赖）。"""
        allowed = {"plugin_menu", "plugin_auth"}
        plugin_src = Path(__file__).resolve().parent.parent / "src" / "plugin_menu"
        violations = []
        for py_file in plugin_src.rglob("*.py"):
            tree = ast.parse(py_file.read_text())
            for node in ast.walk(tree):
                if isinstance(node, ast.ImportFrom) and node.module:
                    top = node.module.split(".")[0]
                    if top.startswith("plugin_") and top not in allowed:
                        violations.append(f"{py_file.name}: {node.module}")
        assert violations == [], f"Cross-plugin imports found: {violations}"
