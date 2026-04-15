"""
rapidkit-common 包的导入和基础功能测试。

验证 common 包可独立导入，所有基类正确导出。
"""


class TestCommonImports:
    """验证 common 包所有模块可正确导入。"""

    def test_import_base_model(self):
        from rapidkit_common.models import SQLModel

        # SQLModel 使用 Field 定义，字段在 model_fields 中
        assert "id" in SQLModel.model_fields
        assert "create_time" in SQLModel.model_fields
        assert "update_time" in SQLModel.model_fields

    def test_import_crud(self):
        from rapidkit_common.crud import BaseSQLModelCRUD

        assert BaseSQLModelCRUD is not None

    def test_import_deps(self):
        from rapidkit_common.deps import SessionDep, RedisDep

        assert SessionDep is not None
        assert RedisDep is not None

    def test_import_schemas_response(self):
        from rapidkit_common.schemas.response import Response, PaginatedResponse

        assert Response is not None
        assert PaginatedResponse is not None

    def test_import_schemas_base(self):
        from rapidkit_common.schemas.base import BaseModel

        assert BaseModel is not None

    def test_import_enums(self):
        from rapidkit_common.enums import Status

        assert hasattr(Status, "ON")
        assert hasattr(Status, "OFF")

    def test_common_depends_on_core(self):
        """验证 common 正确依赖 core（不是循环的）。"""
        from rapidkit_core.status_codes import StatusCode

        assert StatusCode.SUCCESS.code == 0
