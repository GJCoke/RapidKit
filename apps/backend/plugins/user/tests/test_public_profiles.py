"""The public recipient DTO excludes credentials and uses bounded bulk reads."""

from dataclasses import asdict
from uuid import uuid4

import pytest
from plugin_user.models import User
from plugin_user.providers import UserQueryServiceImpl
from rapidkit_common.enums import Status
from sqlalchemy import Column, MetaData, String, Table, Uuid, event, insert
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlmodel.ext.asyncio.session import AsyncSession


@pytest.mark.asyncio
async def test_public_profiles_bulk_names_empty_relationships_and_no_secrets():
    engine = create_async_engine("sqlite+aiosqlite://")
    metadata = MetaData()
    roles = Table("permission_roles", metadata, Column("code", String, primary_key=True), Column("name", String))
    departments = Table("dept_departments", metadata, Column("id", Uuid, primary_key=True), Column("name", String))
    uid, empty_id, disabled_id, dept_id = (uuid4() for _ in range(4))
    async with engine.begin() as connection:
        await connection.run_sync(lambda conn: User.__table__.create(conn))
        await connection.run_sync(metadata.create_all)
        await connection.execute(
            insert(roles), [{"code": "alpha", "name": "Editor"}, {"code": "beta", "name": "Viewer"}]
        )
        await connection.execute(insert(departments), [{"id": dept_id, "name": "Engineering"}])
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as session:
        for user_id, name, codes, dept, status in (
            (uid, "Real Name", ["beta", "alpha", "beta", "missing"], dept_id, Status.ON),
            (empty_id, "Empty", [], None, Status.ON),
            (disabled_id, "Disabled", [], None, Status.OFF),
        ):
            session.add(
                User(
                    id=user_id,
                    name=name,
                    username=str(user_id),
                    email=f"{user_id}@example.test",
                    roles=codes,
                    department_id=dept,
                    status=status,
                    password=b"secret",
                )
            )
        await session.commit()
    statements = []
    event.listen(engine.sync_engine, "before_cursor_execute", lambda *args: statements.append(args[2]))
    service = UserQueryServiceImpl(session_factory=factory)
    assert await service.get_public_profiles([]) == {}
    assert statements == []
    profiles = await service.get_public_profiles([uid, empty_id, disabled_id, uuid4(), uid])
    assert len(statements) == 3
    assert set(profiles) == {uid, empty_id}
    assert profiles[uid].name == "Real Name"
    assert profiles[uid].roles == "Editor、Viewer"
    assert profiles[uid].department == "Engineering"
    assert profiles[empty_id].roles == profiles[empty_id].department == ""
    assert set(asdict(profiles[uid])) == {"id", "name", "email", "roles", "department"}
    assert "password" not in statements[0]
    await engine.dispose()
