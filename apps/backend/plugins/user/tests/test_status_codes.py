"""Tests for user plugin status codes."""


class TestUserStatusCode:
    def test_is_base_status_code_subclass(self):
        from plugin_user.status_codes import UserStatusCode
        from rapidkit_framework.status_codes import BaseStatusCode

        assert issubclass(UserStatusCode, BaseStatusCode)

    def test_plugin_id_is_02(self):
        from plugin_user.status_codes import UserStatusCode

        for code in UserStatusCode:
            assert code.plugin_id == 2, f"{code.name} has wrong plugin_id: {code.plugin_id}"

    def test_old_password_required(self):
        from plugin_user.status_codes import UserStatusCode

        assert UserStatusCode.OLD_PASSWORD_REQUIRED.code == 21001
        assert UserStatusCode.OLD_PASSWORD_REQUIRED.type == 1

    def test_cannot_delete_self(self):
        from plugin_user.status_codes import UserStatusCode

        assert UserStatusCode.CANNOT_DELETE_SELF.code == 22001
        assert UserStatusCode.CANNOT_DELETE_SELF.type == 2

    def test_password_change_forbidden(self):
        from plugin_user.status_codes import UserStatusCode

        assert UserStatusCode.PASSWORD_CHANGE_FORBIDDEN.code == 24001
        assert UserStatusCode.PASSWORD_CHANGE_FORBIDDEN.type == 4

    def test_description_is_i18n_key(self):
        from plugin_user.status_codes import UserStatusCode

        for code in UserStatusCode:
            assert code.description.startswith("user.error."), (
                f"{code.name} description should start with 'user.error.'"
            )

    def test_works_with_app_exception(self):
        from rapidkit_framework.exceptions import AppException

        from plugin_user.status_codes import UserStatusCode

        exc = AppException(UserStatusCode.CANNOT_DELETE_SELF)
        assert exc.code == 22001
