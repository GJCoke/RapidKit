# packages/common/tests/test_scope_runtime.py
"""scope_runtime：会话绑定的行过滤、写入复查与字段写入保护（sqlite 内存库）。"""

import pytest
import pytest_asyncio
from uuid import uuid4
from rapidkit_common.models import SQLModel
from rapidkit_common.scope_runtime import (
    apply_field_rules,
    bind_session_field_rules,
    bind_session_scope,
    get_field_rules,
    install_scope_listeners,
    set_field_rules,
    unscoped,
)
from rapidkit_framework.exceptions import AppException
from rapidkit_framework.status_codes import StatusCode
from sqlalchemy import delete, func, update
from sqlalchemy.ext.asyncio import create_async_engine
from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession


class ScopedItem(SQLModel, table=True):
    __tablename__ = "scope_runtime_items"

    owner: str
    name: str = ""
    phone: str | None = None


@pytest_asyncio.fixture
async def engine():
    install_scope_listeners()
    engine = create_async_engine("sqlite+aiosqlite://")
    async with engine.begin() as conn:
        await conn.run_sync(lambda sync: SQLModel.metadata.create_all(sync, tables=[ScopedItem.__table__]))
    async with AsyncSession(engine, expire_on_commit=False) as session:
        session.add_all([ScopedItem(owner="a", name="1", phone="13800000001"), ScopedItem(owner="b", name="2")])
        await session.commit()
    yield engine
    await engine.dispose()


def _bind(session: AsyncSession) -> AsyncSession:
    bind_session_scope(session, ScopedItem, col(ScopedItem.owner) == "a")
    return session


@pytest.mark.asyncio
async def test_select_count_and_group_by_are_filtered(engine):
    async with AsyncSession(engine) as session:
        _bind(session)
        assert len((await session.exec(select(ScopedItem))).all()) == 1
        assert (await session.exec(select(func.count()).select_from(ScopedItem))).one() == 1
        grouped = (await session.exec(select(ScopedItem.owner, func.count()).group_by(ScopedItem.owner))).all()
        assert [tuple(row) for row in grouped] == [("a", 1)]


@pytest.mark.asyncio
async def test_orm_update_and_delete_are_filtered(engine):
    async with AsyncSession(engine) as session:
        _bind(session)
        updated = await session.exec(update(ScopedItem).values(name="x"))  # ty: ignore[no-matching-overload]
        assert updated.rowcount == 1
        deleted = await session.exec(delete(ScopedItem).where(col(ScopedItem.name) == "2"))  # ty: ignore[no-matching-overload]
        assert deleted.rowcount == 0


@pytest.mark.asyncio
async def test_new_row_outside_scope_is_rejected(engine):
    async with AsyncSession(engine) as session:
        _bind(session)
        session.add(ScopedItem(owner="b"))
        with pytest.raises(AppException) as exc:
            await session.flush()
        assert exc.value.status_code_enum is StatusCode.RESOURCE_OUT_OF_SCOPE


@pytest.mark.asyncio
async def test_moving_row_out_of_scope_is_rejected(engine):
    async with AsyncSession(engine) as session:
        _bind(session)
        item = (await session.exec(select(ScopedItem))).one()
        item.owner = "b"
        session.add(item)
        with pytest.raises(AppException) as exc:
            await session.flush()
        assert exc.value.status_code_enum is StatusCode.RESOURCE_OUT_OF_SCOPE


@pytest.mark.asyncio
async def test_new_row_inside_scope_is_allowed(engine):
    async with AsyncSession(engine) as session:
        _bind(session)
        session.add(ScopedItem(owner="a", name="3"))
        await session.flush()
        assert (await session.exec(select(func.count()).select_from(ScopedItem))).one() == 2


@pytest.mark.asyncio
async def test_unbound_session_and_unscoped_block_see_everything(engine):
    async with AsyncSession(engine) as session:
        assert (await session.exec(select(func.count()).select_from(ScopedItem))).one() == 2
    async with AsyncSession(engine) as session:
        _bind(session)
        with unscoped(session):
            assert (await session.exec(select(func.count()).select_from(ScopedItem))).one() == 2
        assert (await session.exec(select(func.count()).select_from(ScopedItem))).one() == 1


@pytest.mark.asyncio
async def test_restricted_field_cannot_be_written(engine):
    async with AsyncSession(engine) as session:
        bind_session_field_rules(session, {ScopedItem: {"phone": "masked"}})
        session.add(ScopedItem(owner="c", phone="13900000000"))
        with pytest.raises(AppException) as exc:
            await session.flush()
        assert exc.value.status_code_enum is StatusCode.FIELD_WRITE_DENIED

    async with AsyncSession(engine) as session:
        bind_session_field_rules(session, {ScopedItem: {"phone": "masked"}})
        item = (await session.exec(select(ScopedItem).where(col(ScopedItem.owner) == "a"))).one()
        item.name = "renamed"
        session.add(item)
        await session.flush()
        item.phone = "13700000000"
        session.add(item)
        with pytest.raises(AppException) as exc:
            await session.flush()
        assert exc.value.status_code_enum is StatusCode.FIELD_WRITE_DENIED


@pytest.mark.asyncio
async def test_new_row_without_restricted_value_is_allowed(engine):
    async with AsyncSession(engine) as session:
        bind_session_field_rules(session, {ScopedItem: {"phone": "hidden"}})
        session.add(ScopedItem(owner="c"))
        await session.flush()


def test_apply_field_rules_masks_and_hides_with_aliases():
    set_field_rules({ScopedItem: {"phone": "masked", "name": "hidden"}})
    try:
        data = {"owner": "a", "name": "n", "phone": "13800138000"}
        assert apply_field_rules(data, ScopedItem) == {"owner": "a", "phone": "138****8000"}
        aliased = {"owner": "a", "displayName": "n"}
        assert apply_field_rules(aliased, ScopedItem, aliases={"name": "displayName"}) == {"owner": "a"}
        assert get_field_rules() == {ScopedItem: {"phone": "masked", "name": "hidden"}}
    finally:
        set_field_rules({})


def test_apply_field_rules_without_rules_returns_input():
    set_field_rules({})
    data = {"phone": "13800138000"}
    assert apply_field_rules(data, ScopedItem) is data


@pytest.mark.asyncio
async def test_bulk_update_cannot_write_restricted_fields(engine):
    async with AsyncSession(engine) as session:
        bind_session_field_rules(session, {ScopedItem: {"phone": "masked"}})
        with pytest.raises(AppException) as exc:
            await session.exec(update(ScopedItem).values(phone="13700000000"))
        assert exc.value.status_code_enum is StatusCode.FIELD_WRITE_DENIED


@pytest.mark.asyncio
async def test_bulk_update_cannot_change_scope_columns(engine):
    async with AsyncSession(engine) as session:
        _bind(session)
        with pytest.raises(AppException) as exc:
            await session.exec(update(ScopedItem).values(owner="b"))
        assert exc.value.status_code_enum is StatusCode.RESOURCE_OUT_OF_SCOPE


@pytest.mark.asyncio
@pytest.mark.parametrize("field, value, expected", [
    ("phone", "13700000000", StatusCode.FIELD_WRITE_DENIED),
    ("owner", "b", StatusCode.RESOURCE_OUT_OF_SCOPE),
])
async def test_parameterized_bulk_update_cannot_bypass_write_guards(engine, field, value, expected):
    async with AsyncSession(engine) as session:
        _bind(session)
        bind_session_field_rules(session, {ScopedItem: {"phone": "masked"}})
        with pytest.raises(AppException) as exc:
            await session.exec(update(ScopedItem), params={field: value})
        assert exc.value.status_code_enum is expected


@pytest.mark.asyncio
async def test_parameterized_update_cannot_move_a_self_scoped_primary_key(engine):
    async with AsyncSession(engine) as session:
        item = (await session.exec(select(ScopedItem).where(ScopedItem.owner == "a"))).one()
        bind_session_scope(session, ScopedItem, col(ScopedItem.id) == item.id)
        with pytest.raises(AppException) as exc:
            await session.exec(update(ScopedItem), params={"id": uuid4()})
        assert exc.value.status_code_enum is StatusCode.RESOURCE_OUT_OF_SCOPE


@pytest.mark.asyncio
async def test_rejected_flush_can_be_rolled_back_without_persisting(engine):
    async with AsyncSession(engine) as session:
        _bind(session)
        item = (await session.exec(select(ScopedItem))).one()
        item.owner = "b"
        with pytest.raises(AppException):
            await session.flush()
        await session.rollback()
    async with AsyncSession(engine) as session:
        assert (await session.exec(select(ScopedItem.owner).order_by(ScopedItem.owner))).all() == ["a", "b"]
