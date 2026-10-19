"""真实认证链路：扩展绑定即时授予、重复拒绝、删除撤回与拒绝审计。"""

from plugin_permission.status_codes import RbacStatusCode
from plugins.auth.tests.impersonation_helpers import login_headers, strict_client  # noqa: F401


async def test_extension_binding_grants_and_revokes_without_relogin(strict_client, auth_headers):  # noqa: F811
    guest = await login_headers(strict_client, "guest", "123456")
    path = "/users/stats/trend?start=2026-10-16&end=2026-10-17"
    route_key = "GET:/api/v1/users/stats/trend"
    denied = await strict_client.get(path, headers=guest)
    assert denied.json()["code"] == RbacStatusCode.ROLE_PERMISSION_DENIED.code
    assert denied.json()["data"]["code"] == "user:stats"

    denials = (await strict_client.get("/permission-extensions/denials", headers=auth_headers)).json()
    assert denials["code"] == 0
    assert any(row["code"] == "user:stats" and row["routeKey"] == route_key for row in denials["data"])

    body = {"kind": "route_binding", "code": "user:read", "routeKey": route_key, "note": "integration test"}
    created = (await strict_client.post("/permission-extensions", json=body, headers=auth_headers)).json()
    assert created["code"] == 0
    assert created["data"]["status"] == "active"
    extension_id = created["data"]["id"]
    assert (await strict_client.get(path, headers=guest)).json()["code"] == 0

    duplicate = (await strict_client.post("/permission-extensions", json=body, headers=auth_headers)).json()
    assert duplicate["code"] == RbacStatusCode.EXTENSION_ALREADY_EXISTS.code
    covered = (
        await strict_client.post(
            "/permission-extensions",
            headers=auth_headers,
            json={
                "kind": "depends",
                "code": "user:update",
                "dependsOn": "user:read",
            },
        )
    ).json()
    assert covered["code"] == RbacStatusCode.EXTENSION_DUPLICATES_BASELINE.code
    exported = (await strict_client.get("/permission-extensions/export", headers=auth_headers)).json()
    assert exported["code"] == 0
    assert route_key in exported["data"]["text"]

    assert (await strict_client.delete(f"/permission-extensions/{extension_id}", headers=auth_headers)).json()[
        "code"
    ] == 0
    assert (await strict_client.get(path, headers=guest)).json()["code"] == RbacStatusCode.ROLE_PERMISSION_DENIED.code
