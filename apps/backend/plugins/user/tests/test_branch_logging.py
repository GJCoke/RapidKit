from contextlib import asynccontextmanager
from types import SimpleNamespace as NS
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from rapidkit_common.events import DepartmentDeletedEvent, RoleDeletedEvent
from rapidkit_core.timezone import timezone
from tests.testing.utils import one_event


@asynccontextmanager
async def session_scope(session):
    yield session


@pytest.mark.parametrize("operation", ["create", "update"])
async def test_nonadmin_flag_ignored(operation, monkeypatch, json_log):
    from plugin_user import api
    from plugin_user.schemas import UserManageCreate, UserManageUpdate, UserManageResponse

    actor = uuid4()
    target = UserManageResponse(
        id=uuid4(),
        name="private-name",
        username="private-username",
        email="private-email@example.com",
        create_time=timezone.now(),
        update_time=timezone.now(),
    )
    scope = NS(user=NS(id=actor, is_admin=False))
    crud = NS(
        create=AsyncMock(return_value=target),
        get=AsyncMock(return_value=target),
        update_by_id=AsyncMock(return_value=target),
    )
    monkeypatch.setattr(api, "hash_password", lambda *_: "private-hash")
    monkeypatch.setattr(api.event_bus, "fire_and_forget", lambda *_: None)
    monkeypatch.setattr(api, "after_commit", lambda *_: None)
    if operation == "create":
        body = UserManageCreate(
            name="private-name", username="private-username", email="private-email@example.com", is_admin=True
        )
        response = await api.create_user(body, crud, scope)
        assert body.is_admin is False
    else:
        response = await api.update_user(target.id, UserManageUpdate(is_admin=True), scope, crud, None, None)
        assert response.data.is_admin is False
    row = one_event(json_log(), "user.admin_flag.fallback")
    assert (row["level"], row["outcome"], row["reason_code"], row["user_id"]) == (
        "WARNING",
        "fallback",
        "admin_flag_ignored",
        str(actor),
    )
    assert "private-" not in str(json_log())


@pytest.mark.parametrize(
    "reason,method",
    [
        ("impersonation_revoker_unavailable", "revoke_impersonations_for_user"),
        ("socket_closer_unavailable", "close_user_sockets"),
    ],
)
async def test_dependencies_missing(reason, method, monkeypatch, json_log):
    from plugin_user import services

    monkeypatch.setattr(services, "get_service_optional", lambda _: None)
    uid = uuid4()
    await getattr(services, method)(uid, None)
    row = one_event(json_log(), "user.dependency.degraded")
    assert (row["level"], row["outcome"], row["reason_code"], row["user_id"]) == (
        "WARNING",
        "degraded",
        reason,
        str(uid),
    )
    assert "private-" not in str(json_log())


async def test_department_clear_count(monkeypatch, json_log):
    from plugin_user import _on_department_deleted
    from rapidkit_core import database

    uid = uuid4()
    session = NS(exec=AsyncMock(return_value=NS(rowcount=3)), commit=AsyncMock())
    monkeypatch.setattr(database, "AsyncSessionLocal", lambda: session_scope(session))
    await _on_department_deleted(DepartmentDeletedEvent(department_id=str(uid)))
    row = one_event(json_log(), "user.department.cleared")
    assert (row["level"], row["resource_type"], row["resource_id"], row["affected_count"]) == (
        "INFO",
        "department",
        str(uid),
        3,
    )
    assert "private-" not in str(json_log())


@pytest.mark.parametrize("count", [0, 2])
async def test_role_unassign_count(count, monkeypatch, json_log):
    from plugin_user import _on_role_deleted, services
    from rapidkit_core import database

    users = [NS(id=uuid4(), roles=["removed", "other"], name="private-name") for _ in range(count)]
    session = NS(exec=AsyncMock(return_value=NS(all=lambda: users)), commit=AsyncMock())
    monkeypatch.setattr(database, "AsyncSessionLocal", lambda: session_scope(session))
    monkeypatch.setattr(database.RedisManager, "client", lambda: None)
    monkeypatch.setattr(services, "invalidate_user_cache", AsyncMock())
    await _on_role_deleted(RoleDeletedEvent(role_code="removed"))
    assert all(user.roles == ["other"] for user in users)
    row = one_event(json_log(), "user.role.unassigned")
    assert (row["level"], row["resource_type"], row["resource_id"], row["affected_count"]) == (
        "INFO",
        "role",
        "removed",
        count,
    )
    assert "private-" not in str(json_log())
