"""Tests for rbac plugin status codes."""


class TestRbacStatusCode:
    def test_is_base_status_code_subclass(self):
        from plugin_permission.status_codes import RbacStatusCode
        from rapidkit_framework.status_codes import BaseStatusCode

        assert issubclass(RbacStatusCode, BaseStatusCode)

    def test_plugin_id_is_03(self):
        from plugin_permission.status_codes import RbacStatusCode

        for code in RbacStatusCode:
            assert code.plugin_id == 3, f"{code.name} has wrong plugin_id: {code.plugin_id}"

    def test_role_permission_denied(self):
        from plugin_permission.status_codes import RbacStatusCode

        assert RbacStatusCode.ROLE_PERMISSION_DENIED.code == 34001
        assert RbacStatusCode.ROLE_PERMISSION_DENIED.type == 4

    def test_role_not_found(self):
        from plugin_permission.status_codes import RbacStatusCode

        assert RbacStatusCode.ROLE_NOT_FOUND.code == 35001
        assert RbacStatusCode.ROLE_NOT_FOUND.type == 5

    def test_description_is_i18n_key(self):
        from plugin_permission.status_codes import RbacStatusCode

        for code in RbacStatusCode:
            assert code.description.startswith("permission.error."), (
                f"{code.name} description should start with 'permission.error.'"
            )
