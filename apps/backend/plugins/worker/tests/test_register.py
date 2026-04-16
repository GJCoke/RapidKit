"""plugin_worker 注册测试。"""


class TestWorkerRegister:
    def test_register_returns_manifest(self):
        from plugin_worker import register

        m = register()
        assert m.name == "worker"
        assert m.version == "0.1.0"
        assert m.router is not None
        assert len(m.models) == 2

    def test_models_are_correct(self):
        from plugin_worker import register
        from plugin_worker.models import CeleryTaskResult, CeleryWorker

        m = register()
        assert CeleryWorker in m.models
        assert CeleryTaskResult in m.models

    def test_router_has_routes(self):
        from plugin_worker import register

        m = register()
        routes = [r.path for r in m.router.routes]
        assert "/workers" in routes or "/workers/" in routes
        assert "/tasks" in routes or "/tasks/" in routes

    def test_no_cross_plugin_imports(self):
        """plugin_worker 允许导入 plugin_system（声明依赖）。"""
        import ast
        from pathlib import Path

        allowed = {"plugin_worker", "plugin_system"}
        plugin_src = Path(__file__).parent.parent / "src" / "plugin_worker"
        violations = []

        for py_file in plugin_src.rglob("*.py"):
            tree = ast.parse(py_file.read_text())
            for node in ast.walk(tree):
                if isinstance(node, ast.ImportFrom) and node.module:
                    top = node.module.split(".")[0]
                    if top.startswith("plugin_") and top not in allowed:
                        violations.append(f"{py_file.name}: imports {node.module}")

        assert violations == [], f"Cross-plugin imports found: {violations}"
