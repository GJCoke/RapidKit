"""用户接口在会话范围与字段规则下的行为（sqlite 内存库，直接调用端点函数）。"""

from types import SimpleNamespace
from uuid import uuid4

import pytest
import pytest_asyncio
from plugin_user.api import batch_delete_users, get_user, get_users, update_user
from plugin_user.crud import UserManageCRUD
from plugin_user.models import User
from plugin_user.permissions import RESOURCES
from plugin_user.schemas import UserManageBatchBody, UserManagePageQuery, UserManageUpdate
from rapidkit_common.access import Scope
from rapidkit_common.models import SQLModel
from rapidkit_common.scope_runtime import (
    bind_session_field_rules,
    bind_session_scope,
    install_scope_listeners,
    set_field_rules,
    unscoped,
)
from rapidkit_framework.exceptions import AppException
from rapidkit_framework.scopes import ScopeContext
from rapidkit_framework.status_codes import StatusCode
from sqlalchemy.ext.asyncio import create_async_engine
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

DEPT_A, DEPT_B = uuid4(), uuid4()
OPERATOR = SimpleNamespace(id=uuid4(), is_admin=False, roles=["editor"], department_id=DEPT_A)
DEPT_SCOPE = next(scope for scope in RESOURCES[0].data_scopes if scope.key == "dept")


def _user(name: str, username: str, department_id) -> User:
    return User(
        name=name,
        username=username,
        email=f"{username}@example.com",
        password=b"x",
        phone="13800138000",
        department_id=department_id,
    )


@pytest_asyncio.fixture
async def session():
    install_scope_listeners()
    engine = create_async_engine("sqlite+aiosqlite://")
    async with engine.begin() as conn:
        await conn.run_sync(lambda sync: SQLModel.metadata.create_all(sync, tables=[User.__table__]))
    async with AsyncSession(engine, expire_on_commit=False) as setup:
        setup.add_all([_user("张三", "zhangsan", DEPT_A), _user("李四", "lisi00", DEPT_B)])
        await setup.commit()
    async with AsyncSession(engine, expire_on_commit=False) as scoped:
        condition = DEPT_SCOPE.build(ScopeContext(user_id=OPERATOR.id, department_id=DEPT_A))
        bind_session_scope(scoped, User, condition)
        yield scoped
    set_field_rules({})
    await engine.dispose()


async def _id_of(session: AsyncSession, username: str):
    with unscoped(session):
        return (await session.exec(select(User).where(User.username == username))).one().id


async def test_list_is_filtered_and_contact_is_masked(session):
    set_field_rules({User: {"phone": "masked", "email": "masked"}})
    response = await get_users(query=UserManagePageQuery(), user_crud=UserManageCRUD(session))
    records = response.model_dump(mode="json", by_alias=True)["data"]["records"]
    assert [r["username"] for r in records] == ["zhangsan"]
    assert records[0]["phone"] == "138****8000"
    assert records[0]["email"] == "z***@example.com"


async def test_detail_outside_scope_is_not_found(session):
    other = await _id_of(session, "lisi00")
    with pytest.raises(AppException) as exc:
        await get_user(user_id=other, user_crud=UserManageCRUD(session))
    assert exc.value.status_code_enum is StatusCode.RESOURCE_NOT_FOUND


async def test_moving_user_out_of_scope_is_rejected(session):
    own = await _id_of(session, "zhangsan")
    with pytest.raises(AppException) as exc:
        await update_user(
            user_id=own,
            body=UserManageUpdate(department_id=DEPT_B),
            scope=Scope(user=OPERATOR, code="user:update"),
            user_crud=UserManageCRUD(session),
            redis=None,
            session=session,
        )
    assert exc.value.status_code_enum is StatusCode.RESOURCE_OUT_OF_SCOPE


async def test_writing_masked_field_is_rejected(session):
    own = await _id_of(session, "zhangsan")
    bind_session_field_rules(session, {User: {"phone": "masked"}})
    with pytest.raises(AppException) as exc:
        await update_user(
            user_id=own,
            body=UserManageUpdate(phone="13900139000"),
            scope=Scope(user=OPERATOR, code="user:update"),
            user_crud=UserManageCRUD(session),
            redis=None,
            session=session,
        )
    assert exc.value.status_code_enum is StatusCode.FIELD_WRITE_DENIED


async def test_batch_delete_with_invisible_id_is_not_found(session):
    own, other = await _id_of(session, "zhangsan"), await _id_of(session, "lisi00")
    with pytest.raises(AppException) as exc:
        await batch_delete_users(
            body=UserManageBatchBody(ids=[own, other]),
            scope=Scope(user=OPERATOR, code="user:delete"),
            user_crud=UserManageCRUD(session),
            redis=None,
            session=session,
        )
    assert exc.value.status_code_enum is StatusCode.RESOURCE_NOT_FOUND
