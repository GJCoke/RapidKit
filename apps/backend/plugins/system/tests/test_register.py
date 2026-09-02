"""plugin_system 注册测试。"""


class TestSystemRegister:
    def test_register_returns_manifest(self):
        from plugin_system import register

        m = register()
        assert m.name == "system"
        assert m.version == "0.1.0"
        assert m.router is not None
        assert len(m.models) == 3

    def test_models_are_correct(self):
        from plugin_system import register
        from plugin_system.models import ActivityEvent, AuditLog

        m = register()
        assert AuditLog in m.models
        assert ActivityEvent in m.models

    def test_activity_dashboard_uses_curated_realtime_topic(self):
        from plugin_system import register

        module = next(item for item in register().dashboard_modules if item.key == "dashboard.activity")
        assert module.required_permissions == ("GET:/api/v1/system/activities",)
        assert module.realtime_topics == ("dashboard:activity.created",)

    def test_router_has_routes(self):
        from plugin_system import register

        m = register()
        routes = [r.path for r in m.router.routes]
        assert "/system/stats/resources" in routes
        assert "/system/stats/errors" in routes
        assert "/system/stats/health" in routes
        assert "/system/activities" in routes
        assert "/system/audit-logs/paginate" in routes
        assert "/system/audit-logs/{item_id}" in routes
        assert "/system/plugins/dependencies" in routes

    def test_no_cross_plugin_imports(self):
        """plugin_system 允许导入 plugin_menu、plugin_auth、plugin_script（声明依赖）。"""
        import ast
        from pathlib import Path

        allowed = {"plugin_system", "plugin_menu", "plugin_auth", "plugin_script", "plugin_schedule"}
        plugin_src = Path(__file__).parent.parent / "src" / "plugin_system"
        violations = []

        for py_file in plugin_src.rglob("*.py"):
            tree = ast.parse(py_file.read_text())
            for node in ast.walk(tree):
                if isinstance(node, ast.ImportFrom) and node.module:
                    top = node.module.split(".")[0]
                    if top.startswith("plugin_") and top not in allowed:
                        violations.append(f"{py_file.name}: imports {node.module}")

        assert violations == [], f"Cross-plugin imports found: {violations}"
