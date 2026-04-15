"""plugin_monitoring 注册测试。"""


class TestMonitoringRegister:
    def test_register_returns_manifest(self):
        from plugin_monitoring import register

        m = register()
        assert m.name == "monitoring"
        assert m.version == "0.1.0"
        assert m.router is not None
        assert len(m.models) == 1

    def test_models_are_correct(self):
        from plugin_monitoring import register
        from plugin_monitoring.models import ApiMetricsHourly

        m = register()
        assert ApiMetricsHourly in m.models

    def test_router_has_routes(self):
        from plugin_monitoring import register

        m = register()
        routes = [r.path for r in m.router.routes]
        assert "/system/stats/api/overview" in routes
        assert "/system/stats/api/top" in routes
        assert "/system/stats/api/list" in routes

    def test_no_cross_plugin_imports(self):
        """验证 plugin_monitoring 不直接导入其他插件。"""
        import ast
        from pathlib import Path

        plugin_src = Path(__file__).parent.parent / "src" / "plugin_monitoring"
        violations = []

        for py_file in plugin_src.rglob("*.py"):
            tree = ast.parse(py_file.read_text())
            for node in ast.walk(tree):
                if isinstance(node, ast.ImportFrom) and node.module:
                    if node.module.startswith("plugin_") and not node.module.startswith("plugin_monitoring"):
                        violations.append(f"{py_file.name}: imports {node.module}")
                    if node.module.startswith("src.domains"):
                        violations.append(f"{py_file.name}: imports {node.module}")

        assert violations == [], f"Cross-plugin imports found: {violations}"
