"""access_testing 辅助函数测试。"""

from types import SimpleNamespace
from typing import Annotated

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from rapidkit_common.access import Require, Scope, access_guard_dependency
from rapidkit_common.access_testing import allow_access, allow_current_user_access, deny_access
from rapidkit_common.auth import _get_current_user_placeholder


def _app() -> FastAPI:
    app = FastAPI()

    @app.get("/items")
    async def items(scope: Annotated[Scope, Require("item:read")]) -> dict:
        return {"code": scope.code, "user": getattr(scope.user, "name", None)}

    return app


@pytest.mark.asyncio
async def test_allow_access_passes_with_given_user():
    app = _app()
    app.dependency_overrides[access_guard_dependency] = allow_access(SimpleNamespace(name="alice"))
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/items")
    assert response.json() == {"code": "item:read", "user": "alice"}


@pytest.mark.asyncio
async def test_deny_access_returns_status():
    app = _app()
    app.dependency_overrides[access_guard_dependency] = deny_access()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/items")
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_allow_current_user_access_uses_resolved_user():
    app = _app()
    app.dependency_overrides[access_guard_dependency] = allow_current_user_access
    app.dependency_overrides[_get_current_user_placeholder] = lambda: SimpleNamespace(name="bob")
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/items")
    assert response.json() == {"code": "item:read", "user": "bob"}
