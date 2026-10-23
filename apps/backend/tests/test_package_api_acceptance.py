"""真实身份下验证代码功能包应用、权限缓存失效及自定义管理接口退役。"""

import pytest
from plugin_user.models import User
from plugins.auth.tests.impersonation_helpers import login_headers, strict_client  # noqa: F401
from rapidkit_security import hash_password


@pytest.mark.asyncio
async def test_code_package_grants_via_permissions_invalidate_live_role_cache(strict_client, session):  # noqa: F811
    admin = await login_headers(strict_client, "admin", "123456")

    async def ok(method, path, **kwargs):
        body = (await strict_client.request(method, path, headers=admin, **kwargs)).json()
        assert body["code"] == 0, body
        return body["data"]

    role = await ok(
        "POST",
        "/roles",
        json={"name": "Package target", "code": "PKG_TARGET", "status": "1", "description": "Acceptance role"},
    )
    role_id = role["id"]
    await ok(
        "PUT",
        f"/roles/{role_id}/permissions",
        json={"permissionCodes": ["role:read"], "dataScopes": {}, "fieldModes": {}},
    )
    user = User(
        name="Package user",
        username="package-user",
        email="package@example.com",
        password=hash_password("Test123456!"),
        roles=["PKG_TARGET"],
    )
    session.add(user)
    await session.commit()
    identity = await login_headers(strict_client, user.username, "Test123456!")
    assert (await strict_client.get("/users", headers=identity)).json()["code"] != 0
    assert (await strict_client.get("/permission-packages/all", headers=identity)).json()["code"] != 0
    packages = await ok("GET", "/permission-packages/all")
    assert {p["key"] for p in packages} >= {"user.readonly", "user.full"}
    assert not any(p["key"].startswith("custom.") for p in packages)
    readonly = next(package for package in packages if package["key"] == "user.readonly")
    await ok(
        "PUT",
        f"/roles/{role_id}/permissions",
        json={"permissionCodes": ["role:read", *readonly["codes"]], "dataScopes": {}, "fieldModes": {}},
    )
    assert (await ok("GET", f"/roles/{role_id}/permissions"))["permissionCodes"] == ["role:read", "user:read"]
    assert (await strict_client.get("/users", headers=identity)).json()["code"] == 0
    invalid = (
        await strict_client.put(
            f"/roles/{role_id}/permissions", headers=admin, json={"permissionCodes": ["custom.old"]}
        )
    ).json()
    assert invalid["code"] == 34006
    assert (await ok("GET", f"/roles/{role_id}/permissions"))["permissionCodes"] == ["role:read", "user:read"]
    retired = await strict_client.post(
        f"/roles/{role_id}/apply-packages", headers=admin, json={"packageKeys": ["user.readonly"]}
    )
    assert retired.json()["code"] == 404
