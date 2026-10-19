"""真实身份下验证功能包展开、缓存失效和一次性应用。"""

import pytest
from plugin_user.models import User
from plugins.auth.tests.impersonation_helpers import login_headers, strict_client  # noqa: F401
from rapidkit_security import hash_password


@pytest.mark.asyncio
async def test_custom_package_apply_is_one_time_and_invalidates_live_role_cache(strict_client, session):  # noqa: F811
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
    assert len(packages) == 16
    builtin = next(p for p in packages if p["key"] == "user.full")
    for method, kwargs in [("PUT", {"json": {"label": "Changed"}}), ("DELETE", {})]:
        result = (
            await strict_client.request(method, f"/permission-packages/{builtin['id']}", headers=admin, **kwargs)
        ).json()
        assert result["code"] == 35102, result
    package = await ok(
        "POST", "/permission-packages", json={"key": "custom.acceptance", "label": "Acceptance", "codes": ["user:read"]}
    )
    package_id = package["id"]
    listing = await ok("GET", "/permission-packages", params={"keyword": "custom.acceptance"})
    assert [p["id"] for p in listing["records"]] == [package_id]
    merged = await ok("POST", f"/roles/{role_id}/apply-packages", json={"packageKeys": [package["key"]]})
    assert merged["permissionCodes"] == ["role:read", "user:read"]
    assert merged["addedCodes"] == ["user:read"]
    assert (await strict_client.get("/users", headers=identity)).json()["code"] == 0
    await ok("PUT", f"/permission-packages/{package_id}", json={"codes": ["user:read", "user:update"]})
    grants = await ok("GET", f"/roles/{role_id}/permissions")
    assert grants["permissionCodes"] == ["role:read", "user:read"]
    replaced = await ok(
        "POST", f"/roles/{role_id}/apply-packages", json={"packageKeys": [package["key"]], "mode": "replace"}
    )
    assert replaced["permissionCodes"] == ["user:read", "user:update"]
    assert replaced["removedCodes"] == ["role:read"]
    buttons = (await strict_client.get("/auth/user/info", headers=identity)).json()
    assert buttons["code"] == 0, buttons
    assert "user:update" in buttons["data"]["buttons"]
    await ok("DELETE", f"/permission-packages/{package_id}")
    assert (await ok("GET", f"/roles/{role_id}/permissions"))["permissionCodes"] == ["user:read", "user:update"]
    invalid = (
        await strict_client.post(
            "/permission-packages",
            headers=admin,
            json={"key": "custom.invalid", "label": "Invalid", "codes": ["missing:read"]},
        )
    ).json()
    assert invalid["code"] == 35103, invalid
    invalid = (
        await strict_client.post(
            "/permission-packages",
            headers=admin,
            json={
                "key": "custom.invalid",
                "label": "Invalid",
                "codes": ["user:read"],
                "dataScopes": {"user": "removed_scope"},
            },
        )
    ).json()
    assert invalid["code"] == 35104, invalid
