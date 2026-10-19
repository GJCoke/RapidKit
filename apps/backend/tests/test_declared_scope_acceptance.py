"""真实请求链验证声明范围、字段写保护与角色版本后的即时生效。"""

import pytest
from plugin_department.models import Department
from plugin_permission.models import Role
from plugin_user.models import User
from plugins.auth.tests.impersonation_helpers import login_headers, strict_client  # noqa: F401
from rapidkit_framework.status_codes import StatusCode
from sqlmodel import select


@pytest.mark.asyncio
async def test_declared_scopes_and_fields_apply_through_http_and_refresh_after_role_change(
    strict_client,  # noqa: F811
    session,
):
    guest = (await session.exec(select(User).where(User.username == "guest"))).one()
    root = (await session.exec(select(Department))).first()
    role = (await session.exec(select(Role).where(Role.code == "GUEST"))).one()
    guest.department_id = root.id
    session.add_all([guest, Department(name="其他部门", code="SCOPE_OTHER")])
    await session.commit()
    guest_id, root_id, role_id = str(guest.id), str(root.id), str(role.id)
    admin = await login_headers(strict_client, "admin", "123456")
    codes = ["user:read", "user:update"]

    async def set_grants(**settings):
        response = await strict_client.put(
            f"/roles/{role_id}/permissions",
            headers=admin,
            json={"permissionCodes": codes, **settings},
        )
        assert response.json()["code"] == 0, response.json()

    await set_grants(
        dataScopes={"user": "self", "department": "dept"},
        fieldModes={"user": {"contact": "masked"}},
    )
    identity = await login_headers(strict_client, "guest", "123456")
    response = (await strict_client.get("/users", headers=identity)).json()
    assert response["code"] == 0, response
    assert response["data"]["total"] == 1
    assert [item["id"] for item in response["data"]["records"]] == [guest_id]
    assert response["data"]["records"][0]["phone"] == "138****0002"
    assert response["data"]["records"][0]["email"] == "g***@gmail.com"
    departments = (await strict_client.get("/departments/tree", headers=identity)).json()
    assert departments["code"] == 0, departments
    assert [item["id"] for item in departments["data"]] == [root_id]
    restricted = (await strict_client.get("/auth/user/info", headers=identity)).json()
    assert restricted["data"]["restrictedFields"] == {"user": {"phone": "masked", "email": "masked"}}

    admin_row = (await session.exec(select(User).where(User.username == "admin"))).one()
    outside = (await strict_client.get(f"/users/{admin_row.id}", headers=identity)).json()
    assert outside["code"] == StatusCode.RESOURCE_NOT_FOUND.code
    edited = (await strict_client.put(f"/users/{guest_id}", headers=identity, json={"remark": "范围内编辑"})).json()
    assert edited["code"] == 0, edited
    denied = (await strict_client.put(f"/users/{guest_id}", headers=identity, json={"phone": "13700000000"})).json()
    assert denied["code"] == StatusCode.FIELD_WRITE_DENIED.code

    await set_grants(fieldModes={})
    visible = (await strict_client.get("/users", headers=identity)).json()
    assert visible["code"] == 0, visible
    assert visible["data"]["records"][0]["phone"] == "13800000002"
    assert visible["data"]["records"][0]["remark"] == "范围内编辑"
    refreshed = (await strict_client.get("/auth/user/info", headers=identity)).json()
    assert refreshed["data"]["restrictedFields"] == {}
