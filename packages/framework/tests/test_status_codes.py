"""Tests for BaseStatusCode and 6-digit code format."""

from enum import Enum


class TestBaseStatusCode:
    def test_code_and_description(self):
        from rapidkit_framework.status_codes import BaseStatusCode

        class TestCode(BaseStatusCode):
            FOO = (14001, "auth.error.foo")

        assert TestCode.FOO.code == 14001
        assert TestCode.FOO.description == "auth.error.foo"

    def test_plugin_id(self):
        from rapidkit_framework.status_codes import BaseStatusCode

        class TestCode(BaseStatusCode):
            FOO = (14001, "auth.error.foo")

        assert TestCode.FOO.plugin_id == 1

    def test_type_property(self):
        from rapidkit_framework.status_codes import BaseStatusCode

        class TestCode(BaseStatusCode):
            FOO = (14001, "auth.error.foo")

        assert TestCode.FOO.type == 4

    def test_sequence_property(self):
        from rapidkit_framework.status_codes import BaseStatusCode

        class TestCode(BaseStatusCode):
            FOO = (14001, "auth.error.foo")

        assert TestCode.FOO.sequence == 1

    def test_int_conversion(self):
        from rapidkit_framework.status_codes import BaseStatusCode

        class TestCode(BaseStatusCode):
            FOO = (14001, "auth.error.foo")

        assert int(TestCode.FOO) == 14001

    def test_str_conversion(self):
        from rapidkit_framework.status_codes import BaseStatusCode

        class TestCode(BaseStatusCode):
            FOO = (14001, "auth.error.foo")

        assert str(TestCode.FOO) == "auth.error.foo"

    def test_is_enum(self):
        from rapidkit_framework.status_codes import BaseStatusCode

        assert issubclass(BaseStatusCode, Enum)

    def test_framework_code_plugin_id_zero(self):
        """Framework universal codes have plugin_id=0."""
        from rapidkit_framework.status_codes import StatusCode

        assert StatusCode.VALIDATION_ERROR.plugin_id == 0

    def test_get_status_code_by_int(self):
        """get_status_code finds a code by integer value."""
        from rapidkit_framework.status_codes import StatusCode, get_status_code

        result = get_status_code(1001)
        assert result is StatusCode.VALIDATION_ERROR

    def test_get_status_code_not_found(self):
        from rapidkit_framework.status_codes import get_status_code

        assert get_status_code(999999) is None


class TestAppExceptionWithBaseStatusCode:
    def test_accepts_base_status_code_subclass(self):
        from rapidkit_framework.exceptions import AppException
        from rapidkit_framework.status_codes import BaseStatusCode

        class PluginCode(BaseStatusCode):
            TEST_ERROR = (14001, "plugin.error.test")

        exc = AppException(PluginCode.TEST_ERROR)
        assert exc.code == 14001
        assert exc.status_code_enum is PluginCode.TEST_ERROR

    def test_accepts_framework_status_code(self):
        from rapidkit_framework.exceptions import AppException
        from rapidkit_framework.status_codes import StatusCode

        exc = AppException(StatusCode.VALIDATION_ERROR)
        assert exc.code == 1001

    def test_accepts_raw_int(self):
        from rapidkit_framework.exceptions import AppException

        exc = AppException(1001)
        assert exc.code == 1001

    def test_dump(self):
        from rapidkit_framework.exceptions import AppException
        from rapidkit_framework.status_codes import BaseStatusCode

        class PluginCode(BaseStatusCode):
            TEST_ERROR = (14001, "plugin.error.test")

        exc = AppException(PluginCode.TEST_ERROR)
        d = exc.dump()
        assert d["code"] == 14001
        assert "message" in d
