"""Retired API surface and retained replacements."""

from fastapi import APIRouter


def test_retired_business_routes_are_not_mounted():
    from plugin_auth import register as auth
    from plugin_menu import register as menu
    from plugin_notification import register as notification
    from plugin_permission import register as permission
    from plugin_schedule import register as schedule
    from plugin_system import register as system
    from plugin_worker import register as worker

    router = APIRouter()
    for register in (auth, menu, notification, permission, schedule, system, worker):
        router.include_router(register().router)
    routes = {(method, r.path) for r in router.routes for method in r.methods}
    retired = {
        ("GET", "/manage/menus/tree"),
        ("GET", "/router/backend"),
        ("GET", "/roles/mine"),
        ("POST", "/roles/{role_id}/apply-packages"),
        ("GET", "/workers"),
        ("GET", "/tasks/stats/timeline"),
        ("POST", "/schedules/crontab/preview"),
        ("GET", "/notifications/{notification_id}"),
        ("GET", "/admin/notification-templates/{template_id}"),
        ("POST", "/admin/notifications/{message_id}/audience-preview"),
        ("GET", "/system/health"),
    }
    assert not routes & retired
    assert {
        ("POST", "/auth/login/swagger"),
        ("POST", "/auth/logout"),
        ("POST", "/schedules/preview"),
        ("POST", "/admin/notifications/audience-preview"),
        ("GET", "/permission-packages/all"),
        ("GET", "/tasks/stats/summary"),
        ("GET", "/tasks/stats/dashboard"),
        ("GET", "/workers/all"),
    } <= routes


async def test_business_route_count_uses_visible_runtime_routes_without_inventory():
    from unittest.mock import AsyncMock, MagicMock

    from fastapi import FastAPI, Request
    from plugin_system.dashboard.api import get_business_summary

    app = FastAPI()
    app.add_api_route("/visible", lambda: None)
    app.add_api_route("/visible", lambda: None)
    app.add_api_route("/other", lambda: None, methods=["POST"])
    app.add_api_route("/debug", lambda: None, include_in_schema=False)
    session = AsyncMock()
    session.execute.return_value = MagicMock(scalar_one=lambda: 4)
    result = await get_business_summary(session, Request({"type": "http", "app": app}))
    assert result.data.routers == 2
    assert result.data.roles == 4
    assert all("permission_routers" not in str(call.args[0]) for call in session.execute.await_args_list)
