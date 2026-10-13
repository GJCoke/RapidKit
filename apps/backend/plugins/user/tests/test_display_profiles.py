"""Display-only user lookup includes historical recipients without credential reads."""

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
async def test_display_profiles_include_inactive_recipients_with_bounded_public_queries():
    engine = create_async_engine("sqlite+aiosqlite://")
    metadata = MetaData()
    departments = Table("dept_departments", metadata, Column("id", Uuid, primary_key=True), Column("name", String))
    active, disabled, pending, missing, department = (uuid4() for _ in range(5))
    async with engine.begin() as connection:
        await connection.run_sync(lambda conn: User.__table__.create(conn))
        await connection.run_sync(metadata.create_all)
        await connection.execute(insert(departments), [{"id": department, "name": "研发部"}])
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as session:
        for uid, status, name in (
            (active, Status.ON, "张三"),
            (disabled, Status.OFF, "李四"),
            (pending, Status.PENDING, ""),
        ):
            session.add(
                User(
                    id=uid,
                    status=status,
                    name=name,
                    username=str(uid),
                    email=f"{uid}@example.test",
                    password=b"secret",
                    avatar="/avatar.png",
                    department_id=department,
                )
            )
        await session.commit()
    statements = []
    event.listen(engine.sync_engine, "before_cursor_execute", lambda *args: statements.append(args[2]))
    try:
        service = UserQueryServiceImpl(session_factory=factory)
        assert await service.get_display_profiles([]) == {}
        assert statements == []
        profiles = await service.get_display_profiles([active, disabled, pending, missing, active])
        assert set(profiles) == {active, disabled, pending}
        assert len(statements) == 2
        assert profiles[disabled].status == "2"
        assert profiles[pending].status == "3"
        assert profiles[active].name == "张三"
        assert profiles[active].username == str(active)
        assert profiles[active].department == "研发部"
        assert profiles[active].avatar == "/avatar.png"
        assert set(asdict(profiles[active])) == {"id", "name", "username", "avatar", "department", "status"}
        assert not any(field in statements[0] for field in ("password", "email", "phone", "last_login_ip"))
    finally:
        await engine.dispose()
