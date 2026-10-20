"""Permission status codes and translations."""

import json
from pathlib import Path

from plugin_permission.status_codes import RbacStatusCode
from rapidkit_framework.status_codes import BaseStatusCode


def test_status_code_contract():
    assert issubclass(RbacStatusCode, BaseStatusCode)
    assert RbacStatusCode.ROLE_PERMISSION_DENIED.code == 34001
    assert RbacStatusCode.ROLE_PERMISSION_DENIED.type == 4
    assert RbacStatusCode.ROLE_NOT_FOUND.code == 35001
    assert RbacStatusCode.ROLE_NOT_FOUND.type == 5
    for code in RbacStatusCode:
        assert code.plugin_id == 3
        assert code.description.startswith("permission.error.")


def test_permission_status_codes_have_translations():

    root = Path(__file__).resolve().parents[3] / "src/locales/langs"
    for lang in ("zh-CN", "en-US"):
        errors = json.loads((root / lang / "permission.json").read_text())["error"]
        for code in RbacStatusCode:
            key = code.description.removeprefix("permission.error.")
            assert errors.get(key), (lang, code.name)


def test_package_status_codes_are_registered():

    assert RbacStatusCode.PACKAGE_NOT_FOUND.value[0] == 35101
    assert RbacStatusCode.PACKAGE_INVALID_CODES.value[0] == 35103
    assert RbacStatusCode.PACKAGE_INVALID_SCOPES.value[0] == 35104
