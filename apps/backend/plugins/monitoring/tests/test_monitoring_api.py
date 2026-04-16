"""Monitoring API stats tests."""

import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio


class TestApiOverview:
    async def test_overview_returns_valid_structure(self, client: AsyncClient, init, auth_headers: dict):
        resp = await client.get("/system/stats/api/overview", headers=auth_headers, params={"range": "24h"})
        assert resp.status_code == 200
        body = resp.json()
        assert body["code"] == 0
        data = body["data"]
        assert "totalRequests" in data
        assert "totalErrors" in data
        assert "avgErrorRate" in data
        assert "avgMs" in data
        assert "busiestPath" in data
        assert "busiestMethod" in data
        assert "busiestCount" in data

    async def test_overview_with_custom_range(self, client: AsyncClient, init, auth_headers: dict):
        resp = await client.get("/system/stats/api/overview", headers=auth_headers, params={"range": "1h"})
        assert resp.status_code == 200
        body = resp.json()
        assert body["code"] == 0
        assert body["data"]["totalRequests"] >= 0


class TestApiTop:
    async def test_top_endpoints(self, client: AsyncClient, init, auth_headers: dict):
        resp = await client.get(
            "/system/stats/api/top",
            headers=auth_headers,
            params={"range": "1h", "limit": 10},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["code"] == 0
        assert isinstance(body["data"], list)

    async def test_top_with_sort_by(self, client: AsyncClient, init, auth_headers: dict):
        resp = await client.get(
            "/system/stats/api/top",
            headers=auth_headers,
            params={"range": "24h", "sortBy": "errors", "limit": 5},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["code"] == 0
        assert isinstance(body["data"], list)


class TestApiDistribution:
    async def test_distribution_returns_list(self, client: AsyncClient, init, auth_headers: dict):
        resp = await client.get(
            "/system/stats/api/distribution",
            headers=auth_headers,
            params={"range": "1h"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["code"] == 0
        assert isinstance(body["data"], list)


class TestApiTrend:
    async def test_trend_data(self, client: AsyncClient, init, auth_headers: dict):
        resp = await client.get(
            "/system/stats/api/trend",
            headers=auth_headers,
            params={"range": "1h"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["code"] == 0
        assert isinstance(body["data"], list)


class TestApiList:
    async def test_api_list_paginated(self, client: AsyncClient, init, auth_headers: dict):
        resp = await client.get(
            "/system/stats/api/list",
            headers=auth_headers,
            params={"page": 1, "pageSize": 10, "range": "1h"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["code"] == 0
        data = body["data"]
        assert "records" in data
        assert "total" in data
        assert "page" in data
        assert "pageSize" in data

    async def test_api_list_with_keyword(self, client: AsyncClient, init, auth_headers: dict):
        resp = await client.get(
            "/system/stats/api/list",
            headers=auth_headers,
            params={"page": 1, "pageSize": 10, "range": "24h", "keyword": "auth"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["code"] == 0
        assert isinstance(body["data"]["records"], list)

    async def test_api_list_with_sorting(self, client: AsyncClient, init, auth_headers: dict):
        resp = await client.get(
            "/system/stats/api/list",
            headers=auth_headers,
            params={
                "page": 1,
                "pageSize": 10,
                "range": "24h",
                "sortBy": "error_count",
                "sortOrder": "asc",
            },
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["code"] == 0
