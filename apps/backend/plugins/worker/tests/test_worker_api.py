"""Worker API tests with mocked Celery."""

import pytest
from httpx import AsyncClient

from tests.testing.utils import random_uuid


class TestWorkerList:
    async def test_list_workers(self, client: AsyncClient, init, auth_headers: dict):
        resp = await client.get("/workers?page=1&pageSize=10", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json()["code"] == 0

    async def test_get_all_workers(self, client: AsyncClient, init, auth_headers: dict):
        resp = await client.get("/workers/all", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json()["code"] == 0


class TestWorkerControl:
    async def test_ping_worker(self, client: AsyncClient, init, auth_headers: dict, mock_celery_app):
        """Ping a worker -- requires a worker record in DB."""
        resp = await client.get("/workers?page=1&pageSize=1", headers=auth_headers)
        if resp.json()["data"]["total"] == 0:
            pytest.skip("No worker records in DB")
        worker_id = resp.json()["data"]["records"][0]["id"]

        resp = await client.post(
            f"/workers/{worker_id}/ping",
            headers=auth_headers,
        )
        assert resp.status_code == 200

    async def test_ping_nonexistent_worker(self, client: AsyncClient, init, auth_headers: dict, mock_celery_app):
        """Ping a non-existent worker returns error."""
        resp = await client.post(
            f"/workers/{random_uuid()}/ping",
            headers=auth_headers,
        )
        assert resp.json()["code"] != 0

    async def test_shutdown_worker(self, client: AsyncClient, init, auth_headers: dict, mock_celery_app):
        resp = await client.get("/workers?page=1&pageSize=1", headers=auth_headers)
        if resp.json()["data"]["total"] == 0:
            pytest.skip("No worker records in DB")
        worker_id = resp.json()["data"]["records"][0]["id"]

        resp = await client.post(
            f"/workers/{worker_id}/shutdown",
            headers=auth_headers,
        )
        assert resp.status_code == 200

    async def test_pool_grow(self, client: AsyncClient, init, auth_headers: dict, mock_celery_app):
        resp = await client.get("/workers?page=1&pageSize=1", headers=auth_headers)
        if resp.json()["data"]["total"] == 0:
            pytest.skip("No worker records in DB")
        worker_id = resp.json()["data"]["records"][0]["id"]

        resp = await client.post(
            f"/workers/{worker_id}/pool/grow",
            json={"n": 1},
            headers=auth_headers,
        )
        assert resp.status_code == 200

    async def test_pool_shrink(self, client: AsyncClient, init, auth_headers: dict, mock_celery_app):
        resp = await client.get("/workers?page=1&pageSize=1", headers=auth_headers)
        if resp.json()["data"]["total"] == 0:
            pytest.skip("No worker records in DB")
        worker_id = resp.json()["data"]["records"][0]["id"]

        resp = await client.post(
            f"/workers/{worker_id}/pool/shrink",
            json={"n": 1},
            headers=auth_headers,
        )
        assert resp.status_code == 200

    async def test_add_queue(self, client: AsyncClient, init, auth_headers: dict, mock_celery_app):
        resp = await client.get("/workers?page=1&pageSize=1", headers=auth_headers)
        if resp.json()["data"]["total"] == 0:
            pytest.skip("No worker records in DB")
        worker_id = resp.json()["data"]["records"][0]["id"]

        resp = await client.post(
            f"/workers/{worker_id}/queues/add",
            json={"queue": "test_queue"},
            headers=auth_headers,
        )
        assert resp.status_code == 200

    async def test_cancel_queue(self, client: AsyncClient, init, auth_headers: dict, mock_celery_app):
        resp = await client.get("/workers?page=1&pageSize=1", headers=auth_headers)
        if resp.json()["data"]["total"] == 0:
            pytest.skip("No worker records in DB")
        worker_id = resp.json()["data"]["records"][0]["id"]

        resp = await client.post(
            f"/workers/{worker_id}/queues/cancel",
            json={"queue": "test_queue"},
            headers=auth_headers,
        )
        assert resp.status_code == 200

    async def test_get_active_tasks(self, client: AsyncClient, init, auth_headers: dict, mock_celery_app):
        resp = await client.get("/workers?page=1&pageSize=1", headers=auth_headers)
        if resp.json()["data"]["total"] == 0:
            pytest.skip("No worker records in DB")
        worker_id = resp.json()["data"]["records"][0]["id"]

        # Set up mock inspector to return empty task list
        mock_inspector = mock_celery_app.control.inspect.return_value
        mock_inspector.active.return_value = {}

        resp = await client.get(
            f"/workers/{worker_id}/tasks/active",
            headers=auth_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["code"] == 0

    async def test_get_reserved_tasks(self, client: AsyncClient, init, auth_headers: dict, mock_celery_app):
        resp = await client.get("/workers?page=1&pageSize=1", headers=auth_headers)
        if resp.json()["data"]["total"] == 0:
            pytest.skip("No worker records in DB")
        worker_id = resp.json()["data"]["records"][0]["id"]

        mock_inspector = mock_celery_app.control.inspect.return_value
        mock_inspector.reserved.return_value = {}

        resp = await client.get(
            f"/workers/{worker_id}/tasks/reserved",
            headers=auth_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["code"] == 0
