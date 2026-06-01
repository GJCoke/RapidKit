"""plugin_user register() 测试。"""

import ast
import unittest
from pathlib import Path


class TestUserRegister(unittest.TestCase):
    def test_register_returns_manifest(self):
        from plugin_user import register

        m = register()
        assert m.name == "user"
        assert m.version == "0.1.0"

    def test_router_exists(self):
        from plugin_user import register

        m = register()
        assert m.router is not None

    def test_router_has_routes(self):
        from plugin_user import register

        m = register()
        routes = [r.path for r in m.router.routes]
        assert "/users" in routes or "/users/" in routes
        assert "/users/{user_id}" in routes

    def test_depends_on_auth(self):
        from plugin_user import register

        m = register()
        assert "auth" in m.dependencies

    def test_no_cross_plugin_imports(self):
        """plugin_user must not import other plugins (communicates via protocols)."""
        allowed = {"plugin_user"}
        plugin_src = Path(__file__).resolve().parent.parent / "src" / "plugin_user"
        violations = []
        for py_file in plugin_src.rglob("*.py"):
            tree = ast.parse(py_file.read_text())
            for node in ast.walk(tree):
                if isinstance(node, ast.ImportFrom) and node.module:
                    top = node.module.split(".")[0]
                    if top.startswith("plugin_") and top not in allowed:
                        violations.append(f"{py_file.name}: {node.module}")
        assert violations == [], f"Unexpected cross-plugin imports: {violations}"
