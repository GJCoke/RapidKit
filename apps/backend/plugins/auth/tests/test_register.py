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
        assert "/auth/invite/set-password" in routes
        assert "/auth/password-reset/request" in routes
        assert "/auth/password-reset/validate" in routes
        assert "/auth/password-reset/confirm" in routes

    def test_manifest_wires_invite_events_and_task(self):
        from rapidkit_common.events import UserCreatedEvent, UserInviteRequestedEvent

        from plugin_auth import register

        manifest = register()
        assert "plugin_auth.invite.tasks" in manifest.task_modules
        assert "plugin_auth.password_reset.tasks" in manifest.task_modules
        events = {entry[0] for entry in manifest.event_listeners}
        assert UserCreatedEvent in events
        assert UserInviteRequestedEvent in events

    def test_models_is_empty(self):
        from plugin_auth import register

        m = register()
        assert m.models == []

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

    def test_dependency_overrides_in_manifest(self):
        from rapidkit_common.auth import _get_current_user_placeholder

        from plugin_auth import register
        from plugin_auth.auth.deps import get_current_user_form_db

        m = register()
        assert m.dependency_overrides == {_get_current_user_placeholder: get_current_user_form_db}
