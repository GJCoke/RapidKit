"""Read legacy menu data for migration commands without depending on current ORM columns."""

from dataclasses import dataclass

from rapidkit_common.enums import MenuType
from sqlalchemy import JSON, inspect, text
from sqlmodel.ext.asyncio.session import AsyncSession


@dataclass(frozen=True)
class LegacyMenu:
    route_name: str
    menu_type: MenuType
    constant: bool
    interfaces: list[str]


async def read_legacy_menus(session: AsyncSession, *, require_interfaces: bool = False) -> list[LegacyMenu]:
    """Read the interfaces when still present; residual conversion must run before P3."""
    connection = await session.connection()
    columns = await connection.run_sync(lambda sync: {c["name"] for c in inspect(sync).get_columns("menu_menus")})
    has_interfaces = "interfaces" in columns
    if require_interfaces and not has_interfaces:
        raise RuntimeError("Menu interfaces were removed; residual conversion must run before P3.")
    projection = "interfaces" if has_interfaces else "NULL AS interfaces"
    rows = (
        await connection.execute(
            text(f"SELECT route_name, menu_type, constant, {projection} FROM menu_menus").columns(interfaces=JSON)
        )
    ).mappings()
    return [
        LegacyMenu(row["route_name"], MenuType[row["menu_type"]], bool(row["constant"]), row["interfaces"] or [])
        for row in rows
    ]
