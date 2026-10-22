"""Authenticated banner reads and separate publication authorization."""

from contextlib import asynccontextmanager
from datetime import timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from httpx import ASGITransport, AsyncClient
from plugin_notification.admin.api import router as admin_router
from plugin_notification.admin.deps import get_admin_service
from plugin_notification.admin.services import AdminNotificationService
from plugin_notification.banner.deps import get_banner_service
from plugin_notification.banner.services import BannerAnnouncementService
from plugin_notification.inbox.api import router as public_router
from plugin_notification.models import BANNER_STATE_ID, NotificationBannerState
from rapidkit_common.access import access_guard_dependency, inspect_route_access
from rapidkit_common.access_testing import allow_access, deny_access
from rapidkit_common.auth import _get_current_user_placeholder
from rapidkit_core.database import get_async_session
from rapidkit_core.timezone import timezone
from rapidkit_framework.exceptions import AppException
from rapidkit_framework.status_codes import StatusCode


@pytest.mark.asyncio
async def test_public_read_requires_auth_but_no_management_permission_and_hides_future(db_session):
    app = FastAPI()
    app.include_router(public_router, prefix="/api/v1")

    async def session():
        yield db_session

    async def unauthenticated():
        raise HTTPException(401)

    async def forbidden():
        raise HTTPException(403)

    app.dependency_overrides[get_async_session] = session
    app.dependency_overrides[_get_current_user_placeholder] = unauthenticated
    app.dependency_overrides[access_guard_dependency] = deny_access()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        assert (await client.get("/api/v1/notifications/top-banner")).status_code == 401
        app.dependency_overrides[_get_current_user_placeholder] = lambda: SimpleNamespace(id=uuid4())
        response = await client.get("/api/v1/notifications/top-banner")
        assert response.status_code == 200
        data = response.json()["data"]
        assert data == {"current": None, "revision": 0, "serverNow": data["serverNow"], "nextChangeAt": None}
        assert data["serverNow"].endswith("+00:00")
        assert await db_session.get(NotificationBannerState, BANNER_STATE_ID) is None


@pytest.mark.asyncio
async def test_banner_preflight_readonly_and_create_requires_publish_permission(db_session, monkeypatch):
    user = SimpleNamespace(id=uuid4(), is_admin=False)
    permissions = []

    @asynccontextmanager
    async def factory():
        try:
            yield db_session
        except BaseException:
            await db_session.rollback()
            raise

    service = BannerAnnouncementService(factory, broadcaster=AsyncMock())
    admin = AdminNotificationService(factory)
    monkeypatch.setattr(
        "plugin_notification.banner.services.get_external_sio", lambda: SimpleNamespace(emit=AsyncMock())
    )
    app = FastAPI()
    app.include_router(admin_router, prefix="/api/v1")
    app.include_router(public_router, prefix="/api/v1")

    @app.middleware("http")
    async def context(request, call_next):
        request.state.permission_ctx = SimpleNamespace(allows_route=lambda key: key in permissions)
        return await call_next(request)

    @app.exception_handler(AppException)
    async def business_error(request, error):
        return JSONResponse(error.dump())

    async def session():
        yield db_session

    app.dependency_overrides[get_async_session] = session
    app.dependency_overrides[access_guard_dependency] = allow_access(user)
    app.dependency_overrides[_get_current_user_placeholder] = lambda: user
    app.dependency_overrides[_get_current_user_placeholder] = lambda: user
    app.dependency_overrides[get_admin_service] = lambda: admin
    app.dependency_overrides[get_banner_service] = lambda: service
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        check = (await client.post("/api/v1/admin/notifications/banner-check", json={})).json()["data"]
        assert check["revision"] == 0 and check["current"] is None and check["scheduled"] is None
        assert not db_session.dirty
        payload = {
            "displayMode": "top_banner",
            "rawTitle": "Upcoming secret",
            "rawContent": "Future content",
            "bannerRevision": 0,
            "publishAt": (timezone.now() + timedelta(hours=1)).isoformat(),
        }
        error = (await client.post("/api/v1/admin/notifications", json=payload)).json()
        assert error["code"] == StatusCode.FORBIDDEN.code
        permissions.append("POST:/api/v1/admin/notifications/{message_id}/publish")
        response = await client.post("/api/v1/admin/notifications", json=payload)
        assert response.json()["code"] == StatusCode.SUCCESS.code
        public = (await client.get("/api/v1/notifications/top-banner")).json()["data"]
        assert public["current"] is None and public["nextChangeAt"] is not None
        assert "Upcoming secret" not in str(public) and "Future content" not in str(public)
        check = (await client.post("/api/v1/admin/notifications/banner-check", json={})).json()["data"]
        assert check["scheduled"]["title"] == "Upcoming secret"
        message_id = response.json()["data"]["messageId"]
        edit = {**payload, "bannerRevision": 1}
        permissions.clear()
        error = (await client.put(f"/api/v1/admin/notifications/{message_id}", json=edit)).json()
        assert error["code"] == StatusCode.FORBIDDEN.code
