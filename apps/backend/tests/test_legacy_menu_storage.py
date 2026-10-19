"""Migration commands read old menu columns independently of the current ORM model."""

import pytest
from rapidkit_common.enums import MenuType
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine
from sqlmodel.ext.asyncio.session import AsyncSession
from src._legacy_menu_storage import read_legacy_menus


@pytest.mark.asyncio
@pytest.mark.parametrize("legacy", [True, False])
async def test_reader_handles_schema_before_and_after_p3(legacy):
    engine = create_async_engine("sqlite+aiosqlite://")
    try:
        async with AsyncSession(engine) as session:
            extra = ", interfaces JSON" if legacy else ", permission TEXT"
            await session.exec(
                text("CREATE TABLE menu_menus (route_name TEXT, menu_type TEXT, constant BOOLEAN" + extra + ")")
            )
            await session.exec(text("INSERT INTO menu_menus VALUES ('manage', 'DIRECTORY', false, NULL)"))
            if legacy:
                await session.exec(
                    text("UPDATE menu_menus SET interfaces = :value"), params={"value": '["GET:/custom"]'}
                )
            menus = await read_legacy_menus(session)
            assert menus[0].menu_type == MenuType.DIRECTORY
            assert menus[0].interfaces == (["GET:/custom"] if legacy else [])
            if not legacy:
                with pytest.raises(RuntimeError, match="before P3"):
                    await read_legacy_menus(session, require_interfaces=True)
    finally:
        await engine.dispose()
