"""Tests for department plugin status codes."""


class TestDeptStatusCode:
    def test_is_base_status_code_subclass(self):
        from plugin_department.status_codes import DeptStatusCode
        from rapidkit_framework.status_codes import BaseStatusCode

        assert issubclass(DeptStatusCode, BaseStatusCode)

    def test_plugin_id_is_04(self):
        from plugin_department.status_codes import DeptStatusCode

        for code in DeptStatusCode:
            assert code.plugin_id == 4, f"{code.name} has wrong plugin_id: {code.plugin_id}"

    def test_has_children(self):
        from plugin_department.status_codes import DeptStatusCode

        assert DeptStatusCode.HAS_CHILDREN.code == 42001
        assert DeptStatusCode.HAS_CHILDREN.type == 2

    def test_description_is_i18n_key(self):
        from plugin_department.status_codes import DeptStatusCode

        for code in DeptStatusCode:
            assert code.description.startswith("department.error."), (
                f"{code.name} description should start with 'department.error.'"
            )
