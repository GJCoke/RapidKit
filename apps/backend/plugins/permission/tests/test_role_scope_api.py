# apps/backend/plugins/permission/tests/test_role_scope_api.py
"""角色权限接口：读取时返回生效值与收紧项，保存时校验并去掉默认值。"""

from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from rapidkit_framework.exceptions import AppException

from plugin_permission.catalog.registry import set_catalog
from plugin_permission.role.api import get_role_permissions, update_role_permissions
from plugin_permission.role.schemas import RolePermissionsUpdateBody
from plugin_permission.status_codes import RbacStatusCode
from plugins.permission.tests.catalog_fixtures import make_scoped_catalog


class FakeRoleCrud:
    def __init__(self, role) -> None:
        self.role = role
        self.session = SimpleNamespace()
        self.updates: list[dict] = []

    async def get(self, role_id, nullable=True):
        return self.role

    async def update_by_id(self, role_id, values):
        self.updates.append(values)
        return self.role


def _role(**fields):
    return SimpleNamespace(
        id=uuid4(),
        code="R_EDITOR",
        permission_codes=fields.get("permission_codes", ["item:read"]),
        data_scopes=fields.get("data_scopes", {}),
        field_modes=fields.get("field_modes", {}),
    )


@pytest.fixture(autouse=True)
def _catalog():
    set_catalog(make_scoped_catalog())


async def test_get_returns_effective_values_and_invalid_items():
    role = _role(data_scopes={"item": "region"}, field_modes={"item": {"note": "masked", "contact": "hidden"}})
    data = (await get_role_permissions(role_id=role.id, role_crud=FakeRoleCrud(role))).model_dump(by_alias=True)["data"]
    assert data["dataScopes"] == {"item": "self"}
    assert data["fieldModes"] == {"item": {"note": "hidden", "contact": "hidden"}}
    assert data["invalidScopes"] == [
        {"resource": "item", "group": None, "stored": "region", "effective": "self"},
        {"resource": "item", "group": "note", "stored": "masked", "effective": "hidden"},
    ]


async def test_put_normalizes_scopes():
    crud = FakeRoleCrud(_role())
    body = RolePermissionsUpdateBody(
        permission_codes=["item:read"],
        data_scopes={"item": "dept", "plain": "all"},
        field_modes={"item": {"contact": "masked", "note": "visible"}},
    )
    await update_role_permissions(role_id=crud.role.id, body=body, role_crud=crud, user=SimpleNamespace(id=uuid4()),
                                  redis=AsyncMock())
    assert crud.updates == [
        {"permission_codes": ["item:read"], "data_scopes": {"item": "dept"}, "field_modes": {"item": {"contact": "masked"}}}
    ]


async def test_put_without_scopes_keeps_them():
    crud = FakeRoleCrud(_role())
    body = RolePermissionsUpdateBody(permission_codes=["item:read"])
    await update_role_permissions(role_id=crud.role.id, body=body, role_crud=crud, user=SimpleNamespace(id=uuid4()),
                                  redis=AsyncMock())
    assert crud.updates == [{"permission_codes": ["item:read"]}]


async def test_put_rejects_invalid_scope():
    crud = FakeRoleCrud(_role())
    body = RolePermissionsUpdateBody(permission_codes=["item:read"], data_scopes={"item": "region"})
    with pytest.raises(AppException) as exc:
        await update_role_permissions(role_id=crud.role.id, body=body, role_crud=crud,
                                      user=SimpleNamespace(id=uuid4()), redis=AsyncMock())
    assert exc.value.status_code_enum is RbacStatusCode.INVALID_DATA_SCOPE
