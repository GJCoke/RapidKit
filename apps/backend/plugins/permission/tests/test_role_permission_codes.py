# apps/backend/plugins/permission/tests/test_role_permission_codes.py
"""角色权限码校验测试。"""

import pytest
from rapidkit_framework.exceptions import AppException

from plugin_permission.role.permission_codes import ensure_known_codes, split_permission_codes
from plugin_permission.role.schemas import RolePermissionsUpdateBody
from plugin_permission.status_codes import RbacStatusCode
from plugins.permission.tests.catalog_fixtures import make_catalog


def test_split_dedupes_and_keeps_order():
    valid, invalid = split_permission_codes(["user:read", "ghost:x", "user:read", "role:read"], make_catalog())

    assert valid == ["user:read", "role:read"]
    assert invalid == ["ghost:x"]


def test_unknown_codes_are_rejected_with_list():
    with pytest.raises(AppException) as error:
        ensure_known_codes(["user:read", "ghost:x"], make_catalog())

    assert error.value.code == RbacStatusCode.UNKNOWN_PERMISSION_CODE.code
    assert error.value.data == {"codes": ["ghost:x"]}


def test_known_codes_pass():
    assert ensure_known_codes(["user:update"], make_catalog()) == ["user:update"]


def test_update_body_keeps_scopes_untouched_when_omitted():
    body = RolePermissionsUpdateBody.model_validate({"permissionCodes": ["user:read"]})

    assert body.permission_codes == ["user:read"]
    assert body.data_scopes is None
    assert body.field_modes is None
