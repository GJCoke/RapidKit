"""前端 Api.Permission 类型（P2 OpenAPI 类型的别名）依赖的响应字段。"""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_permission_catalog_exposes_fields_used_by_frontend(client: AsyncClient, init, auth_headers: dict):
    body = (await client.get("/permission-catalog", headers=auth_headers)).json()

    assert body["code"] == 0
    resource = body["data"]["resources"][0]
    code = body["data"]["codes"][0]
    assert {"key", "label", "dataScopes", "fieldGroups"} <= resource.keys()
    assert {"code", "resource", "label", "abacAction", "depends", "source"} <= code.keys()


@pytest.mark.asyncio
async def test_role_permissions_expose_fields_used_by_frontend(client: AsyncClient, init, auth_headers: dict):
    roles = (await client.get("/roles/all", headers=auth_headers)).json()["data"]
    role_id = next(role["id"] for role in roles if role["code"] == "GUEST")

    data = (await client.get(f"/roles/{role_id}/permissions", headers=auth_headers)).json()["data"]

    assert {"permissionCodes", "dataScopes", "fieldModes", "invalidCodes", "invalidScopes"} <= data.keys()
