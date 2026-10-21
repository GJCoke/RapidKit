"""部门筛选与人数始终使用当前请求的数据范围。"""

from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
import pytest_asyncio
from plugin_user import api
from plugin_user.crud import UserManageCRUD
from plugin_user.models import User
from plugin_user.schemas import UserManagePageQuery
from pydantic import ValidationError
from rapidkit_common.enums import Status
from rapidkit_common.models import SQLModel
from rapidkit_common.scope_runtime import bind_session_scope, install_scope_listeners, set_field_rules
from sqlalchemy.ext.asyncio import create_async_engine
from sqlmodel import col
from sqlmodel.ext.asyncio.session import AsyncSession

PARENT, CHILD, OTHER = uuid4(), uuid4(), uuid4()


@pytest_asyncio.fixture
async def session(monkeypatch):
    install_scope_listeners()
    engine = create_async_engine("sqlite+aiosqlite://")
    async with engine.begin() as connection:
        await connection.run_sync(lambda sync: SQLModel.metadata.create_all(sync, tables=[User.__table__]))
    async with AsyncSession(engine, expire_on_commit=False) as session:
        for username, department, status in [
            ("parent01", PARENT, Status.ON),
            ("child001", CHILD, Status.ON),
            ("child002", CHILD, Status.OFF),
            ("other001", OTHER, Status.ON),
            ("no_dept1", None, Status.ON),
        ]:
            session.add(
                User(
                    name=username,
                    username=username,
                    email=f"{username}@example.com",
                    password=b"x",
                    department_id=department,
                    status=status,
                )
            )
        await session.commit()
        resolver = SimpleNamespace(
            get_subtree_ids=AsyncMock(side_effect=lambda dept: [PARENT, CHILD] if dept == PARENT else [dept])
        )
        monkeypatch.setattr(api, "get_service", lambda _: resolver, raising=False)
        yield session
    set_field_rules({})
    await engine.dispose()


@pytest.mark.parametrize(
    ("query", "names", "total"),
    [
        ({}, {"parent01", "child001", "child002", "other001", "no_dept1"}, 5),
        ({"departmentId": str(PARENT)}, {"parent01", "child001", "child002"}, 3),
        ({"departmentId": str(PARENT), "includeChildren": False}, {"parent01"}, 1),
        ({"unassigned": True}, {"no_dept1"}, 1),
        ({"departmentId": str(CHILD), "status": "1", "keyword": "child"}, {"child001"}, 1),
        ({"departmentId": str(PARENT), "pageSize": 1}, None, 3),
        ({"departmentId": str(uuid4())}, set(), 0),
    ],
)
async def test_department_filter_and_total(session, query, names, total):
    response = await api.get_users(query=UserManagePageQuery.model_validate(query), user_crud=UserManageCRUD(session))
    payload = response.model_dump(mode="json", by_alias=True)["data"]
    assert payload["total"] == total
    if names is not None:
        assert {item["username"] for item in payload["records"]} == names
    else:
        assert len(payload["records"]) == 1


async def test_counts_include_unassigned_without_loading_all_users(session):
    response = await api.get_user_department_counts(user_crud=UserManageCRUD(session))
    assert response.model_dump(mode="json", by_alias=True)["data"] == {
        "total": 5,
        "unassigned": 1,
        "departments": {str(PARENT): 1, str(CHILD): 2, str(OTHER): 1},
    }


async def test_filter_and_counts_cannot_expand_session_scope(session):
    bind_session_scope(session, User, col(User.department_id) == CHILD)
    query = UserManagePageQuery.model_validate({"departmentId": str(OTHER)})
    response = await api.get_users(query=query, user_crud=UserManageCRUD(session))
    assert response.data.total == 0
    counts = await api.get_user_department_counts(user_crud=UserManageCRUD(session))
    assert counts.model_dump(mode="json")["data"] == {
        "total": 2,
        "unassigned": 0,
        "departments": {str(CHILD): 2},
    }


async def test_counts_return_zero_for_empty_scope(session):
    bind_session_scope(session, User, col(User.id) == uuid4())
    response = await api.get_user_department_counts(user_crud=UserManageCRUD(session))
    assert response.model_dump(mode="json")["data"] == {"total": 0, "unassigned": 0, "departments": {}}


def test_invalid_department_id_is_rejected():
    with pytest.raises(ValidationError):
        UserManagePageQuery.model_validate({"departmentId": "not-a-uuid"})
