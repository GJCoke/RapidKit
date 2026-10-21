import pytest
import pytest_asyncio
from plugin_system.audit_writer import AuditWriterImpl
from plugin_system.models import AuditLog
from rapidkit_common.audit import AuditRecord
from sqlalchemy.ext.asyncio import create_async_engine
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

pytestmark = pytest.mark.asyncio


@pytest_asyncio.fixture
async def session():
    engine = create_async_engine("sqlite+aiosqlite://", connect_args={"autocommit": False})
    async with engine.begin() as connection:
        await connection.run_sync(AuditLog.__table__.create)
    async with AsyncSession(engine, expire_on_commit=False) as value:
        yield value
    await engine.dispose()


async def test_duplicate_delivery_preserves_one_row(session):
    writer = AuditWriterImpl()
    record = AuditRecord(action="user.update", result="success", resource_id="target")
    await writer.append_in_transaction(session, record)
    await writer.append_in_transaction(session, record)
    rows = (await session.exec(select(AuditLog))).all()
    assert len(rows) == 1
    assert "schema_version" not in rows[0].model_dump()
    assert rows[0].resource_id == "target"


async def test_same_id_different_content_cannot_overwrite_history(session):
    writer = AuditWriterImpl()
    record = AuditRecord(action="user.update", result="success")
    await writer.append_in_transaction(session, record)
    with pytest.raises(ValueError, match="conflicting"):
        await writer.append_in_transaction(session, record.model_copy(update={"action": "user.delete"}))


async def test_outer_rollback_removes_transactional_success(session):
    await session.begin()
    await AuditWriterImpl().append_in_transaction(
        session, AuditRecord(action="role.grant-permissions", result="success")
    )
    await session.rollback()
    assert (await session.exec(select(AuditLog))).all() == []
