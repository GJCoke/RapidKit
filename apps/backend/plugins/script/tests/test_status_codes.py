"""Tests for script plugin status codes."""


class TestScriptStatusCode:
    def test_is_base_status_code_subclass(self):
        from plugin_script.status_codes import ScriptStatusCode
        from rapidkit_framework.status_codes import BaseStatusCode

        assert issubclass(ScriptStatusCode, BaseStatusCode)

    def test_plugin_id_is_08(self):
        from plugin_script.status_codes import ScriptStatusCode

        for code in ScriptStatusCode:
            assert code.plugin_id == 8, f"{code.name} has wrong plugin_id: {code.plugin_id}"

    def test_unsupported_language(self):
        from plugin_script.status_codes import ScriptStatusCode

        assert ScriptStatusCode.UNSUPPORTED_LANGUAGE.code == 81001
        assert ScriptStatusCode.UNSUPPORTED_LANGUAGE.type == 1

    def test_description_is_i18n_key(self):
        from plugin_script.status_codes import ScriptStatusCode

        for code in ScriptStatusCode:
            assert code.description.startswith("script.error."), (
                f"{code.name} description should start with 'script.error.'"
            )
