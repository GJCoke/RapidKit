"""Task API tests with mocked Celery."""

from httpx import AsyncClient

from tests.testing.utils import random_uuid


class TestTaskList:
    async def test_list_tasks(self, client: AsyncClient, init, auth_headers: dict):
        resp = await client.get("/tasks?page=1&pageSize=10", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json()["code"] == 0

    async def test_get_task_not_found(self, client: AsyncClient, init, auth_headers: dict):
        resp = await client.get(f"/tasks/{random_uuid()}", headers=auth_headers)
        assert resp.json()["code"] != 0


class TestTaskStats:
    async def test_stats_summary(self, client: AsyncClient, init, auth_headers: dict):
        resp = await client.get("/tasks/stats/summary", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json()["code"] == 0

    async def test_stats_timeline(self, client: AsyncClient, init, auth_headers: dict):
        resp = await client.get("/tasks/stats/timeline", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json()["code"] == 0

    async def test_stats_by_name(self, client: AsyncClient, init, auth_headers: dict):
        resp = await client.get("/tasks/stats/by-name", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json()["code"] == 0

    async def test_stats_by_worker(self, client: AsyncClient, init, auth_headers: dict):
        resp = await client.get("/tasks/stats/by-worker", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json()["code"] == 0


class TestTaskOperations:
    async def test_get_registered_tasks(self, client: AsyncClient, init, auth_headers: dict, mock_celery_app):
        resp = await client.get("/tasks/registered", headers=auth_headers)
        assert resp.status_code == 200
        body = resp.json()
        assert body["code"] == 0
        assert "tasks" in body["data"]

    async def test_trigger_task(self, client: AsyncClient, init, auth_headers: dict, mock_celery_app):
        resp = await client.post(
            "/tasks/trigger",
            json={"taskName": "test.task", "args": [], "kwargs": {}},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["code"] == 0
        assert body["data"]["taskId"] == "mock-task-id"

    async def test_trigger_unregistered_task(self, client: AsyncClient, init, auth_headers: dict, mock_celery_app):
        resp = await client.post(
            "/tasks/trigger",
            json={"taskName": "nonexistent.task", "args": [], "kwargs": {}},
            headers=auth_headers,
        )
        assert resp.json()["code"] != 0

    async def test_revoke_task(self, client: AsyncClient, init, auth_headers: dict, mock_celery_app):
        resp = await client.post(
            f"/tasks/{random_uuid()}/revoke",
            headers=auth_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["code"] == 0
