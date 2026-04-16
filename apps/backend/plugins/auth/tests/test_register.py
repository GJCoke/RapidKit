"""plugin_auth register() 测试。"""

import ast
import unittest
from pathlib import Path


class TestAuthRegister(unittest.TestCase):
    def test_register_returns_manifest(self):
        from plugin_auth import register

        m = register()
        assert m.name == "auth"
        assert m.version == "0.1.0"

    def test_router_exists(self):
        from plugin_auth import register

        m = register()
        assert m.router is not None

    def test_router_has_auth_routes(self):
        from plugin_auth import register

        m = register()
        routes = [r.path for r in m.router.routes]
        assert "/auth/login" in routes
        assert "/auth/logout" in routes
        assert "/auth/user/info" in routes

    def test_router_has_role_routes(self):
        from plugin_auth import register

        m = register()
        routes = [r.path for r in m.router.routes]
        assert "/roles" in routes or "/roles/" in routes

    def test_router_has_router_routes(self):
        from plugin_auth import register

        m = register()
        routes = [r.path for r in m.router.routes]
        assert "/router/backend" in routes

    def test_models_contains_all(self):
        from plugin_auth import register
        from plugin_auth.auth.models import User
        from plugin_auth.role.models import Role
        from plugin_auth.router.models import InterfaceRouter

        m = register()
        assert User in m.models
        assert Role in m.models
        assert InterfaceRouter in m.models

    def test_no_cross_plugin_imports(self):
        """plugin_auth 允许导入 plugin_system 和 plugin_user（声明依赖）。"""
        allowed = {"plugin_auth", "plugin_system", "plugin_user"}
        plugin_src = Path(__file__).resolve().parent.parent / "src" / "plugin_auth"
        violations = []
        for py_file in plugin_src.rglob("*.py"):
            tree = ast.parse(py_file.read_text())
            for node in ast.walk(tree):
                if isinstance(node, ast.ImportFrom) and node.module:
                    top = node.module.split(".")[0]
                    if top.startswith("plugin_") and top not in allowed:
                        violations.append(f"{py_file.name}: {node.module}")
        assert violations == [], f"Cross-plugin imports found: {violations}"

    def test_setup_dependency_overrides_callable(self):
        from plugin_auth import setup_dependency_overrides

        assert callable(setup_dependency_overrides)
