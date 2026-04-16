"""Script CRUD and execution API tests."""

from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient

from tests.testing.utils import random_lowercase, random_uuid


@pytest.mark.asyncio
class TestCreateScript:
    async def test_create_python_script(self, client: AsyncClient, init, auth_headers: dict):
        resp = await client.post(
            "/scripts",
            json={
                "name": f"test_{random_lowercase(6)}",
                "language": "python",
                "code": "print('hello')",
                "description": "Test script",
            },
            headers=auth_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["code"] == 0
        assert resp.json()["data"]["language"] == "python"

    async def test_create_shell_script(self, client: AsyncClient, init, auth_headers: dict):
        resp = await client.post(
            "/scripts",
            json={
                "name": f"shell_{random_lowercase(6)}",
                "language": "shell",
                "code": "echo hello",
                "description": "Shell test",
            },
            headers=auth_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["code"] == 0


@pytest.mark.asyncio
class TestReadScript:
    async def test_list_paginated(self, client: AsyncClient, init, auth_headers: dict):
        # Create a script first
        await client.post(
            "/scripts",
            json={
                "name": f"list_{random_lowercase(6)}",
                "language": "python",
                "code": "pass",
            },
            headers=auth_headers,
        )

        resp = await client.get("/scripts?page=1&pageSize=10", headers=auth_headers)
        assert resp.status_code == 200
        body = resp.json()
        assert body["code"] == 0
        assert body["data"]["total"] >= 1

    async def test_get_by_id(self, client: AsyncClient, init, auth_headers: dict):
        resp = await client.post(
            "/scripts",
            json={
                "name": f"detail_{random_lowercase(6)}",
                "language": "python",
                "code": "x = 1",
            },
            headers=auth_headers,
        )
        script_id = resp.json()["data"]["id"]

        resp = await client.get(f"/scripts/{script_id}", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json()["code"] == 0
        assert resp.json()["data"]["id"] == script_id

    async def test_get_not_found(self, client: AsyncClient, init, auth_headers: dict):
        resp = await client.get(f"/scripts/{random_uuid()}", headers=auth_headers)
        assert resp.json()["code"] != 0


@pytest.mark.asyncio
class TestExecuteScript:
    async def test_execute_success(self, client: AsyncClient, init, auth_headers: dict):
        """Execute a script -- subprocess is mocked for safety."""
        resp = await client.post(
            "/scripts",
            json={
                "name": f"exec_{random_lowercase(6)}",
                "language": "python",
                "code": "print('output')",
            },
            headers=auth_headers,
        )
        script_id = resp.json()["data"]["id"]

        mock_result = AsyncMock()
        mock_result.stdout = "output\n"
        mock_result.stderr = ""
        mock_result.returncode = 0

        with patch("plugin_script.services.asyncio.create_subprocess_exec", return_value=mock_result):
            mock_result.communicate = AsyncMock(return_value=(b"output\n", b""))

            resp = await client.post(
                f"/scripts/{script_id}/execute",
                headers=auth_headers,
            )
            assert resp.status_code == 200
            body = resp.json()
            assert body["code"] == 0

    async def test_get_execution_records(self, client: AsyncClient, init, auth_headers: dict):
        """Get execution history for a script."""
        resp = await client.post(
            "/scripts",
            json={
                "name": f"history_{random_lowercase(6)}",
                "language": "python",
                "code": "pass",
            },
            headers=auth_headers,
        )
        script_id = resp.json()["data"]["id"]

        resp = await client.get(
            f"/scripts/{script_id}/executions?page=1&pageSize=10",
            headers=auth_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["code"] == 0


@pytest.mark.asyncio
class TestDeleteScript:
    async def test_delete_single(self, client: AsyncClient, init, auth_headers: dict):
        resp = await client.post(
            "/scripts",
            json={
                "name": f"del_{random_lowercase(6)}",
                "language": "python",
                "code": "pass",
            },
            headers=auth_headers,
        )
        script_id = resp.json()["data"]["id"]

        resp = await client.delete(f"/scripts/{script_id}", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json()["code"] == 0

    async def test_batch_delete(self, client: AsyncClient, init, auth_headers: dict):
        ids = []
        for _ in range(2):
            resp = await client.post(
                "/scripts",
                json={
                    "name": f"batch_{random_lowercase(6)}",
                    "language": "shell",
                    "code": "echo hi",
                },
                headers=auth_headers,
            )
            ids.append(resp.json()["data"]["id"])

        resp = await client.request(
            "DELETE",
            "/scripts",
            json={"ids": ids},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["code"] == 0
