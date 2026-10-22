from contextlib import aclosing

import pytest
from plugin_department.models import Department
from rapidkit_common.audit import AuditContext, current_audit
from rapidkit_core import database
from rapidkit_framework.audit import AuditActionDef
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlmodel.ext.asyncio.session import AsyncSession

pytestmark = pytest.mark.asyncio


@pytest.mark.parametrize("reference", ["existing", "missing", "malformed", "scoped-out", "hidden-name", "masked-name"])
async def test_reference_names_are_snapshotted_before_publish_and_survive_rename(reference):
    from uuid import uuid4

    from plugin_department.audit import AUDIT_ROUTES
    from rapidkit_common.audit import AuditChange, prepare_audit_commit
    from rapidkit_common.scope_runtime import bind_session_scope, install_scope_listeners, set_field_rules
    from sqlalchemy import false

    engine = create_async_engine("sqlite+aiosqlite://", connect_args={"autocommit": False})
    async with engine.begin() as connection:
        await connection.run_sync(Department.__table__.create)
    try:
        async with AsyncSession(engine, expire_on_commit=False) as session:
            parent = Department(name="Engineering", code="eng")
            session.add(parent)
            await session.commit()
            context = AuditContext(action_def=AUDIT_ROUTES["update_department"])
            reference_id = (
                str(uuid4()) if reference == "missing" else "malformed" if reference == "malformed" else str(parent.id)
            )
            context.record.metadata.changes = [AuditChange(field="parent_id", after=reference_id)]
            if reference == "scoped-out":
                install_scope_listeners()
                bind_session_scope(session, Department, false())
            if reference in {"hidden-name", "masked-name"}:
                set_field_rules({Department: {"name": "hidden" if reference == "hidden-name" else "masked"}})
            await prepare_audit_commit(session, context)
            if reference not in {"scoped-out", "hidden-name", "masked-name"}:
                parent.name = "Renamed later"
                await session.commit()
            change = context.snapshot().metadata.changes[0]
            assert change.after == reference_id
            assert change.after_display == (
                "Engineering" if reference == "existing" else "******" if reference == "masked-name" else None
            )
            assert change.before_display is None
    finally:
        set_field_rules({})
        await engine.dispose()


async def test_commit_publishes_only_confirmed_object_snapshot(monkeypatch):
    engine = create_async_engine("sqlite+aiosqlite://", connect_args={"autocommit": False})
    async with engine.begin() as connection:
        await connection.run_sync(Department.__table__.create)
    monkeypatch.setattr(
        database,
        "get_async_session_factory",
        lambda: async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False),
    )
    records = []

    async def publish(record):
        records.append(record)

    context = AuditContext(
        publish=publish,
        action_def=AuditActionDef(
            "department.create",
            "audit.create",
            "department",
            "audit.department",
            model=Department,
            fields={"name": "audit.name"},
        ),
    )
    context.record.action = "department.create"
    token = current_audit.set(context)
    try:
        async with aclosing(database.get_async_session()) as generator:
            session = await anext(generator)
            session.add(Department(name="Actual object", code="actual"))
            await session.flush()
            assert records == []
            with pytest.raises(StopAsyncIteration):
                await anext(generator)
        assert len(records) == 1
        assert records[0].resource_name == "Actual object"
        assert records[0].result == "success"
        assert context.committed is True
    finally:
        current_audit.reset(token)
        await engine.dispose()


@pytest.mark.parametrize("before,after", [(None, {"is_admin": True}), ({"roles": ["reader"]}, {"roles": ["admin"]})])
async def test_privilege_changes_require_atomic_audit(before, after):
    from types import SimpleNamespace

    from plugin_user.audit import AUDIT_ROUTES
    from plugin_user.models import User
    from rapidkit_common.audit import capture_audit_model
    from rapidkit_core.uuid7 import uuid7

    object_id = str(uuid7())
    user = User(id=object_id, username="admin", name="Admin", password=b"test")
    context = AuditContext(action_def=AUDIT_ROUTES["update_user"])
    token = current_audit.set(context)
    try:
        capture_audit_model(
            SimpleNamespace(info={}),
            user,
            {"id": object_id, **before} if before is not None else None,
            {"id": object_id, **after},
        )
        assert context.transactional is True
        assert context.record.risk_level == "critical"
    finally:
        current_audit.reset(token)
