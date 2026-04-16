"""
rapidkit-core 包的导入和基础功能测试。

这些测试验证 core 包可独立导入，所有模块正确导出，无循环依赖。
"""

import ast
from pathlib import Path


class TestCoreImports:
    """验证 core 包所有模块可正确导入。"""

    def test_import_environment(self):
        from rapidkit_core.environment import Environment

        assert hasattr(Environment, "LOCAL")
        assert hasattr(Environment, "PRODUCTION")
        assert Environment.LOCAL.is_dev is True
        assert Environment.PRODUCTION.is_deployed is True

    def test_import_status_codes(self):
        from rapidkit_core.status_codes import StatusCode

        assert StatusCode.SUCCESS.code == 0

    def test_import_exceptions(self):
        from rapidkit_core.exceptions import AppException

        assert issubclass(AppException, Exception)

    def test_import_redis_client(self):
        from rapidkit_core.redis_client import AsyncRedisClient

        assert AsyncRedisClient is not None

    def test_import_log(self):
        from rapidkit_core.log import logger

        assert logger is not None

    def test_import_i18n(self):
        from rapidkit_core.i18n import is_i18n_key, t

        # 默认 translator 返回原始值
        assert t("hello") == "hello"
        assert is_i18n_key("common.response.success") is True
        assert is_i18n_key("no_dots") is False

    def test_set_translator(self):
        from rapidkit_core.i18n import set_translator, t

        set_translator(lambda s: f"translated:{s}")
        assert t("hello") == "translated:hello"

        # 恢复默认
        set_translator(lambda s: s)

    def test_import_uuid7(self):
        from rapidkit_core.uuid7 import uuid7

        val = uuid7()
        assert val is not None

    def test_import_constants(self):
        from rapidkit_core.constants import DAYS, WEEKS

        assert DAYS == 86400
        assert WEEKS == 604800


class TestNoCoreToCommonDependency:
    """验证 core 包不依赖 common 包（无循环依赖）。"""

    def test_no_rapidkit_common_imports_in_core(self):
        core_src = Path(__file__).parent.parent / "src" / "rapidkit_core"
        violations = []

        for py_file in core_src.rglob("*.py"):
            tree = ast.parse(py_file.read_text())
            for node in ast.walk(tree):
                if isinstance(node, ast.ImportFrom) and node.module and "rapidkit_common" in node.module:
                    violations.append(f"{py_file.name}: imports {node.module}")

        assert violations == [], f"Core depends on common: {violations}"
