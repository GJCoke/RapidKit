"""plugin_script 注册测试。"""


class TestScriptRegister:
    def test_register_returns_manifest(self):
        from plugin_script import register

        m = register()
        assert m.name == "script"
        assert m.version == "0.1.0"
        assert m.router is not None
        assert len(m.models) == 2

    def test_models_are_correct(self):
        from plugin_script import register
        from plugin_script.models import Script, ScriptExecution

        m = register()
        assert Script in m.models
        assert ScriptExecution in m.models

    def test_router_has_routes(self):
        from plugin_script import register

        m = register()
        routes = [r.path for r in m.router.routes]
        assert "/scripts" in routes or "/scripts/" in routes  # list endpoint
        assert "/scripts/{script_id}" in routes

    def test_no_cross_plugin_imports(self):
        """验证 plugin_script 不直接导入其他插件。"""
        import ast
        from pathlib import Path

        plugin_src = Path(__file__).parent.parent / "src" / "plugin_script"
        violations = []

        for py_file in plugin_src.rglob("*.py"):
            tree = ast.parse(py_file.read_text())
            for node in ast.walk(tree):
                if isinstance(node, ast.ImportFrom) and node.module:
                    if node.module.startswith("plugin_") and not node.module.startswith("plugin_script"):
                        violations.append(f"{py_file.name}: imports {node.module}")
                    if node.module.startswith("src.domains"):
                        violations.append(f"{py_file.name}: imports {node.module}")

        assert violations == [], f"Cross-plugin imports found: {violations}"
