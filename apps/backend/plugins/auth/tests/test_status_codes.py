"""Tests for auth plugin status codes."""

import json
from pathlib import Path

from plugin_auth.status_codes import AuthStatusCode
from rapidkit_framework.exceptions import AppException
from rapidkit_framework.status_codes import BaseStatusCode


def test_invite_status_codes_present() -> None:
    assert AuthStatusCode.INVITE_TOKEN_INVALID.value == (14011, "auth.error.inviteTokenInvalid")
    assert AuthStatusCode.INVITE_TOKEN_EXPIRED.value == (14012, "auth.error.inviteTokenExpired")
    assert AuthStatusCode.ACCOUNT_NOT_ACTIVATED.value == (14013, "auth.error.accountNotActivated")


def test_password_reset_status_code_present() -> None:
    assert AuthStatusCode.PASSWORD_RESET_TOKEN_INVALID.value == (14014, "auth.error.passwordResetTokenInvalid")


class TestAuthStatusCode:
    def test_is_base_status_code_subclass(self):
        assert issubclass(AuthStatusCode, BaseStatusCode)

    def test_plugin_id_is_01(self):
        for code in AuthStatusCode:
            assert code.plugin_id == 1, f"{code.name} has wrong plugin_id: {code.plugin_id}"

    def test_token_expired_code(self):
        assert AuthStatusCode.TOKEN_EXPIRED.code == 14002
        assert AuthStatusCode.TOKEN_EXPIRED.type == 4
        assert AuthStatusCode.TOKEN_EXPIRED.sequence == 2

    def test_user_not_found_code(self):
        assert AuthStatusCode.USER_NOT_FOUND.code == 15001
        assert AuthStatusCode.USER_NOT_FOUND.type == 5

    def test_department_has_children(self):
        assert AuthStatusCode.DEPARTMENT_HAS_CHILDREN.code == 12001
        assert AuthStatusCode.DEPARTMENT_HAS_CHILDREN.type == 2

    def test_description_is_i18n_key(self):
        for code in AuthStatusCode:
            assert code.description.startswith("auth.error."), (
                f"{code.name} description should start with 'auth.error.'"
            )

    def test_works_with_app_exception(self):
        exc = AppException(AuthStatusCode.TOKEN_EXPIRED)
        assert exc.code == 14002


def test_impersonation_codes_and_translations_are_complete_and_unique():
    expected = {
        "IMPERSONATION_ADMIN_REQUIRED": (14015, "impersonationAdminRequired"),
        "IMPERSONATION_TARGET_INVALID": (14016, "impersonationTargetInvalid"),
        "IMPERSONATION_SESSION_INVALID": (14017, "impersonationSessionInvalid"),
        "IMPERSONATION_OPERATION_DENIED": (14018, "impersonationOperationDenied"),
        "IMPERSONATION_AUDIT_FAILED": (17001, "impersonationAuditFailed"),
    }
    members = list(AuthStatusCode.__members__.values())
    assert len({code.code for code in members}) == len(members)
    assert len({code.description for code in members}) == len(members)
    locales = Path(__file__).resolve().parents[3] / "src/locales/langs"
    for name, (number, key) in expected.items():
        assert AuthStatusCode[name].value == (number, f"auth.error.{key}")
        for language in ("zh-CN", "en-US"):
            data = json.loads((locales / language / "auth.json").read_text())
            assert isinstance(data["error"][key], str)
            assert data["error"][key].strip()
