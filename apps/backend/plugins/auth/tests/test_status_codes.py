"""Tests for auth plugin status codes."""

from enum import Enum


class TestAuthStatusCode:
    def test_is_base_status_code_subclass(self):
        from plugin_auth.status_codes import AuthStatusCode
        from rapidkit_framework.status_codes import BaseStatusCode

        assert issubclass(AuthStatusCode, BaseStatusCode)

    def test_plugin_id_is_01(self):
        from plugin_auth.status_codes import AuthStatusCode

        for code in AuthStatusCode:
            assert code.plugin_id == 1, f"{code.name} has wrong plugin_id: {code.plugin_id}"

    def test_token_expired_code(self):
        from plugin_auth.status_codes import AuthStatusCode

        assert AuthStatusCode.TOKEN_EXPIRED.code == 14002
        assert AuthStatusCode.TOKEN_EXPIRED.type == 4
        assert AuthStatusCode.TOKEN_EXPIRED.sequence == 2

    def test_user_not_found_code(self):
        from plugin_auth.status_codes import AuthStatusCode

        assert AuthStatusCode.USER_NOT_FOUND.code == 15001
        assert AuthStatusCode.USER_NOT_FOUND.type == 5

    def test_department_has_children(self):
        from plugin_auth.status_codes import AuthStatusCode

        assert AuthStatusCode.DEPARTMENT_HAS_CHILDREN.code == 12001
        assert AuthStatusCode.DEPARTMENT_HAS_CHILDREN.type == 2

    def test_description_is_i18n_key(self):
        from plugin_auth.status_codes import AuthStatusCode

        for code in AuthStatusCode:
            assert code.description.startswith("auth.error."), (
                f"{code.name} description should start with 'auth.error.'"
            )

    def test_works_with_app_exception(self):
        from rapidkit_framework.exceptions import AppException

        from plugin_auth.status_codes import AuthStatusCode

        exc = AppException(AuthStatusCode.TOKEN_EXPIRED)
        assert exc.code == 14002
