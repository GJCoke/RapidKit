# ruff: noqa: F811
from importlib import import_module
from types import SimpleNamespace
from typing import Annotated

import pytest
import pytest_asyncio
from fastapi import Depends
from plugin_department.models import Department
from plugin_menu.models import Menu
from plugin_permission.data_policy.deps import DataPermissionFilter
from plugin_permission.field_guard.deps import FieldPermissionFilter
from plugin_permission.field_guard.models import FieldPolicy
from plugin_permission.models import DataPolicy, Role
from plugin_permission.role.deps import VerifyPermissionDep
from plugin_permission.router.sync import store_router_in_db
from plugin_user.crud import UserManageCRUD
from plugin_user.models import User
from plugins.auth.tests.impersonation_helpers import login_headers, strict_client  # noqa: F401
from rapidkit_common.deps import SessionDep
from rapidkit_common.field_permission import FieldRestrictions, serialize_with_restrictions
from rapidkit_common.schemas.response import Response
from rapidkit_security import hash_password
from sqlalchemy import ColumnElement
from sqlmodel import select


async def scoped_users(
    user: VerifyPermissionDep,
    session: SessionDep,
    data_filter: Annotated[ColumnElement[bool], Depends(DataPermissionFilter(User))],
    field_rules: Annotated[FieldRestrictions, Depends(FieldPermissionFilter(User))],
) -> Response[dict]:
    page = await UserManageCRUD(session).get_paginate(data_filter, page=1, size=100)
    return Response(
        data={
            "total": page.total,
            "records": [
                serialize_with_restrictions({"id": str(item.id), "phone": item.phone}, field_rules)
                for item in page.records
            ],
        }
    )


@pytest_asyncio.fixture
async def permission_client(strict_client):
    app = import_module("src.main").app
    previous = list(app.router.routes)
    app.add_api_route("/api/v1/test/impersonation-scoped-users", scoped_users, methods=["GET"])
    await store_router_in_db(app.routes)
    try:
        yield strict_client
    finally:
        app.router.routes[:] = previous


@pytest_asyncio.fixture
async def identities(permission_client, auth_headers, session):
    department = Department(name="Scope department", code="scope-department")
    other_department = Department(name="Other department", code="other-department")
    session.add_all([department, other_department])
    await session.flush()
    password = hash_password("Test123456!")
    users = [
        User(
            name="Target user",
            username="scope-target",
            email="target@example.com",
            password=password,
            department_id=department.id,
            phone="13800138000",
        ),
        User(
            name="Coworker",
            username="scope-coworker",
            email="coworker@example.com",
            password=password,
            department_id=department.id,
            phone="13900139000",
        ),
        User(
            name="Other user",
            username="scope-other",
            email="other@example.com",
            password=password,
            department_id=other_department.id,
            phone="13700137000",
        ),
    ]
    session.add_all(users)
    await session.flush()
    data = DataPolicy(
        name="Own user only",
        target_model="user_users",
        actions=["read"],
        rule={
            "type": "group",
            "logic": "AND",
            "conditions": [
                {"type": "condition", "field": "id", "operator": "eq", "value": "${user.id}"},
            ],
        },
    )
    field = FieldPolicy(
        name="Mask user phone", target_model="user_users", fields=["phone"], actions=["read"], effect="mask"
    )
    session.add_all([data, field])
    await session.flush()
    menus = (await session.exec(select(Menu).where(Menu.route_name.in_(["home", "manage_user"])))).all()
    assert menus
    role = Role(
        name="Scoped user",
        code="scope-user",
        interface_permissions=[
            "GET:/api/v1/users",
            "GET:/api/v1/users/{user_id}",
            "GET:/api/v1/test/impersonation-scoped-users",
        ],
        button_permissions=["scope:query", "scope:detail"],
        router_permissions=[item.route_name for item in menus],
        data_policy_ids=[str(data.id)],
        field_policy_ids=[str(field.id)],
    )
    session.add(role)
    users[0].roles = [role.code]
    session.add(users[0])
    await session.commit()
    real_headers = await login_headers(permission_client, users[0].username, "Test123456!")
    return SimpleNamespace(
        target=users[0], coworker=users[1], other=users[2], real_headers=real_headers, admin_headers=auth_headers
    )


@pytest.mark.asyncio
async def test_real_login_and_impersonation_permissions_match(permission_client, identities, session):
    created = (
        await permission_client.post(
            "/auth/impersonations", headers=identities.admin_headers, json={"targetUserId": str(identities.target.id)}
        )
    ).json()
    assert created["code"] == 0, created
    simulated = {"Authorization": "Bearer " + created["data"]["accessToken"]}
    for path in (
        "/auth/user/info",
        "/route/user",
        "/users",
        "/users/" + str(identities.target.id),
        "/test/impersonation-scoped-users",
    ):
        actual = (await permission_client.get(path, headers=identities.real_headers)).json()
        impersonated = (await permission_client.get(path, headers=simulated)).json()
        assert actual["code"] == impersonated["code"] == 0, (path, actual, impersonated)
        assert impersonated["data"] == actual["data"], path
    info = (await permission_client.get("/auth/user/info", headers=simulated)).json()["data"]
    assert info["isAdmin"] is False
    assert set(info["buttons"]) == {"scope:query", "scope:detail"}
    for headers in (identities.real_headers, simulated):
        scoped = (await permission_client.get("/test/impersonation-scoped-users", headers=headers)).json()["data"]
        assert scoped == {"total": 1, "records": [{"id": str(identities.target.id), "phone": "138****8000"}]}
        denied = (await permission_client.delete("/users/" + str(identities.other.id), headers=headers)).json()
        assert denied["code"] == 34001, denied
    admin_data = (
        await permission_client.get("/test/impersonation-scoped-users", headers=identities.admin_headers)
    ).json()["data"]
    assert admin_data["total"] > 1
    assert any(
        item["id"] == str(identities.target.id) and item["phone"] == "13800138000" for item in admin_data["records"]
    )
    assert await session.get(User, identities.other.id) is not None
