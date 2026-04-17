"""System stats and activity log API tests."""

from httpx import AsyncClient


class TestResourceStats:
    async def test_get_all_resources(self, client: AsyncClient, init, auth_headers: dict):
        resp = await client.get("/system/stats/resources", headers=auth_headers)
        assert resp.status_code == 200
        body = resp.json()
        assert body["code"] == 0
        data = body["data"]
        assert "instances" in data
        assert "summary" in data
        assert isinstance(data["instances"], list)
        # Summary should always have hostname
        assert "hostname" in data["summary"]

    async def test_get_resources_by_instance(self, client: AsyncClient, init, auth_headers: dict):
        resp = await client.get(
            "/system/stats/resources",
            params={"instance": "nonexistent-host"},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["code"] == 0
        data = body["data"]
        # Should return empty instance data for unknown host
        assert len(data["instances"]) == 1
        assert data["instances"][0]["hostname"] == "nonexistent-host"
        assert data["instances"][0]["cpuPercent"] == 0


class TestErrorStats:
    async def test_get_errors(self, client: AsyncClient, init, auth_headers: dict):
        resp = await client.get("/system/stats/errors", headers=auth_headers)
        assert resp.status_code == 200
        body = resp.json()
        assert body["code"] == 0
        data = body["data"]
        assert "http5xxCount" in data
        assert "bizErrorCount" in data
        assert "totalRequests" in data
        assert "errorRate" in data
        assert "sparkline24h" in data
        assert isinstance(data["sparkline24h"], list)
        assert len(data["sparkline24h"]) == 24


class TestHealthStats:
    async def test_get_health(self, client: AsyncClient, init, auth_headers: dict):
        resp = await client.get("/system/stats/health", headers=auth_headers)
        assert resp.status_code == 200
        body = resp.json()
        assert body["code"] == 0
        data = body["data"]
        assert "qps" in data
        assert "p50Ms" in data
        assert "p95Ms" in data
        assert "wsConnections" in data


class TestInfrastructureHealth:
    async def test_get_infrastructure(self, client: AsyncClient, init, auth_headers: dict):
        resp = await client.get("/system/stats/infrastructure", headers=auth_headers)
        assert resp.status_code == 200
        body = resp.json()
        assert body["code"] == 0
        data = body["data"]
        assert "pg" in data
        assert "redis" in data
        assert "minio" in data
        # Each service should have status and latencyMs
        for svc in ("pg", "redis", "minio"):
            assert "status" in data[svc]
            assert "latencyMs" in data[svc]


class TestBusinessSummary:
    async def test_get_business(self, client: AsyncClient, init, auth_headers: dict):
        resp = await client.get("/system/stats/business", headers=auth_headers)
        assert resp.status_code == 200
        body = resp.json()
        assert body["code"] == 0
        data = body["data"]
        assert "roles" in data
        assert "menus" in data
        assert "routers" in data
        assert "scripts" in data
        assert "schedules" in data
        # After init, there should be at least some roles and menus
        assert data["roles"] >= 1
        assert data["menus"] >= 0


class TestActivityLog:
    async def test_get_activities(self, client: AsyncClient, init, auth_headers: dict):
        resp = await client.get("/system/activities", headers=auth_headers)
        assert resp.status_code == 200
        body = resp.json()
        assert body["code"] == 0
        assert isinstance(body["data"], list)


class TestPluginDependencies:
    async def test_get_dependencies(self, client: AsyncClient, init, auth_headers: dict):
        resp = await client.get("/system/plugins/dependencies", headers=auth_headers)
        assert resp.status_code == 200
        body = resp.json()
        assert body["code"] == 0
        data = body["data"]
        assert "nodes" in data
        assert "edges" in data
        assert isinstance(data["nodes"], list)
        assert isinstance(data["edges"], list)
        # At least the system plugin should be present
        node_names = [n["name"] for n in data["nodes"]]
        assert "system" in node_names

    async def test_dependencies_have_edges_for_system(self, client: AsyncClient, init, auth_headers: dict):
        resp = await client.get("/system/plugins/dependencies", headers=auth_headers)
        body = resp.json()
        data = body["data"]
        # system plugin depends on auth, menu, script
        system_edges = [e for e in data["edges"] if e["source"] == "system"]
        target_names = {e["target"] for e in system_edges}
        assert "auth" in target_names
        assert "menu" in target_names
        assert "script" in target_names

    async def test_nodes_have_required_fields(self, client: AsyncClient, init, auth_headers: dict):
        resp = await client.get("/system/plugins/dependencies", headers=auth_headers)
        body = resp.json()
        for node in body["data"]["nodes"]:
            assert "name" in node
            assert "status" in node
            assert node["status"] in ("loaded", "disabled", "failed", "degraded")
