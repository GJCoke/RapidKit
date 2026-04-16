"""Schedule (Periodic Task) CRUD API tests."""

from httpx import AsyncClient

from tests.testing.utils import random_lowercase, random_uuid


class TestCreateSchedule:
    async def test_create_interval_task(self, client: AsyncClient, init, auth_headers: dict):
        resp = await client.post(
            "/schedules",
            json={
                "name": f"interval_{random_lowercase(6)}",
                "task": "test.task",
                "taskType": "interval",
                "interval": {"every": 60, "period": "seconds"},
                "enabled": False,
            },
            headers=auth_headers,
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["code"] == 0
        assert body["data"]["taskType"] == "interval"
        assert body["data"]["interval"] is not None

    async def test_create_crontab_task(self, client: AsyncClient, init, auth_headers: dict):
        resp = await client.post(
            "/schedules",
            json={
                "name": f"cron_{random_lowercase(6)}",
                "task": "test.cron_task",
                "taskType": "crontab",
                "crontab": {"minute": "0", "hour": "*/2"},
                "enabled": False,
            },
            headers=auth_headers,
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["code"] == 0
        assert body["data"]["taskType"] == "crontab"
        assert body["data"]["crontab"] is not None

    async def test_create_interval_without_interval_body(self, client: AsyncClient, init, auth_headers: dict):
        """Creating an interval task without interval config should fail."""
        resp = await client.post(
            "/schedules",
            json={
                "name": f"bad_{random_lowercase(6)}",
                "task": "test.task",
                "taskType": "interval",
                "enabled": False,
            },
            headers=auth_headers,
        )
        assert resp.json()["code"] != 0

    async def test_create_crontab_without_crontab_body(self, client: AsyncClient, init, auth_headers: dict):
        """Creating a crontab task without crontab config should fail."""
        resp = await client.post(
            "/schedules",
            json={
                "name": f"bad_{random_lowercase(6)}",
                "task": "test.task",
                "taskType": "crontab",
                "enabled": False,
            },
            headers=auth_headers,
        )
        assert resp.json()["code"] != 0


class TestReadSchedule:
    async def test_list_schedules(self, client: AsyncClient, init, auth_headers: dict):
        resp = await client.get("/schedules?page=1&pageSize=10", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json()["code"] == 0

    async def test_get_by_id(self, client: AsyncClient, init, auth_headers: dict):
        # Create one first
        resp = await client.post(
            "/schedules",
            json={
                "name": f"get_{random_lowercase(6)}",
                "task": "test.task",
                "taskType": "interval",
                "interval": {"every": 30, "period": "seconds"},
                "enabled": False,
            },
            headers=auth_headers,
        )
        schedule_id = resp.json()["data"]["id"]

        resp = await client.get(f"/schedules/{schedule_id}", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json()["code"] == 0
        assert resp.json()["data"]["id"] == schedule_id

    async def test_get_not_found(self, client: AsyncClient, init, auth_headers: dict):
        resp = await client.get(f"/schedules/{random_uuid()}", headers=auth_headers)
        assert resp.json()["code"] != 0


class TestUpdateSchedule:
    async def test_update_name(self, client: AsyncClient, init, auth_headers: dict):
        resp = await client.post(
            "/schedules",
            json={
                "name": f"upd_{random_lowercase(6)}",
                "task": "test.task",
                "taskType": "interval",
                "interval": {"every": 60, "period": "seconds"},
                "enabled": False,
            },
            headers=auth_headers,
        )
        schedule_id = resp.json()["data"]["id"]

        new_name = f"updated_{random_lowercase(6)}"
        resp = await client.put(
            f"/schedules/{schedule_id}",
            json={"name": new_name},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["code"] == 0

    async def test_toggle_enabled(self, client: AsyncClient, init, auth_headers: dict):
        resp = await client.post(
            "/schedules",
            json={
                "name": f"toggle_{random_lowercase(6)}",
                "task": "test.task",
                "taskType": "interval",
                "interval": {"every": 60, "period": "seconds"},
                "enabled": False,
            },
            headers=auth_headers,
        )
        schedule_id = resp.json()["data"]["id"]

        resp = await client.patch(
            f"/schedules/{schedule_id}/toggle",
            headers=auth_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["code"] == 0
        # Task was created with enabled=False, so toggling should make it True
        assert resp.json()["data"]["enabled"] is True

    async def test_update_nonexistent(self, client: AsyncClient, init, auth_headers: dict):
        resp = await client.put(
            f"/schedules/{random_uuid()}",
            json={"name": "nope"},
            headers=auth_headers,
        )
        assert resp.json()["code"] != 0


class TestDeleteSchedule:
    async def test_delete_single(self, client: AsyncClient, init, auth_headers: dict):
        resp = await client.post(
            "/schedules",
            json={
                "name": f"del_{random_lowercase(6)}",
                "task": "test.task",
                "taskType": "interval",
                "interval": {"every": 60, "period": "seconds"},
                "enabled": False,
            },
            headers=auth_headers,
        )
        schedule_id = resp.json()["data"]["id"]

        resp = await client.delete(f"/schedules/{schedule_id}", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json()["code"] == 0

        # Verify it's gone
        resp = await client.get(f"/schedules/{schedule_id}", headers=auth_headers)
        assert resp.json()["code"] != 0

    async def test_delete_nonexistent(self, client: AsyncClient, init, auth_headers: dict):
        resp = await client.delete(f"/schedules/{random_uuid()}", headers=auth_headers)
        assert resp.json()["code"] != 0
