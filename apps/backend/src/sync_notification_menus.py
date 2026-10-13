"""Incrementally install notification menus: python -m src.sync_notification_menus --apply."""

import argparse
import asyncio
import json

from plugin_menu.models import Menu
from plugin_menu.services import invalidate_menu_cache
from rapidkit_core.database import AsyncSessionLocal, RedisManager
from sqlmodel import select

from src._menu_seeds import build_menus

NOTIFICATION_ROUTES = {
    "notificationManage",
    "notification_manage_templates",
    "notification_manage_announcements",
    "notification_manage_deliveries",
}


def build_missing_notification_menus(existing_menus: list[Menu]) -> list[Menu]:
    """Plan missing menus, reusing the stored parent and preserving existing records."""
    existing = {menu.route_name: menu for menu in existing_menus}
    paths = {menu.route_path: menu.route_name for menu in existing_menus}
    seeds = [menu for menu in build_menus() if menu.route_name in NOTIFICATION_ROUTES]
    root_seed = next(menu for menu in seeds if menu.route_name == "notificationManage")
    root = existing.get(root_seed.route_name, root_seed)
    missing: list[Menu] = []
    for seed in seeds:
        if seed.route_name in existing:
            continue
        if seed.route_path in paths:
            raise ValueError(f"Menu path already belongs to another route: {seed.route_path}")
        if seed.parent_id is not None:
            seed.parent_id = root.id
        missing.append(seed)
    return missing


async def sync_notification_menus(apply: bool = False) -> None:
    """Preview by default; apply inserts in one transaction and invalidate menu cache."""
    if apply:
        RedisManager.connect()
    try:
        if apply:
            await RedisManager.client().execute_command("PING")
        async with AsyncSessionLocal() as session:
            async with session.begin():
                statement = select(Menu)
                if apply:
                    statement = statement.with_for_update()
                existing = list((await session.exec(statement)).all())
                missing = build_missing_notification_menus(existing)
                if apply:
                    session.add_all(missing)
            report = {
                "applied": apply,
                "created" if apply else "missing": [menu.route_name for menu in missing],
                "existing_menu_count": len(existing),
            }
        if apply:
            await invalidate_menu_cache(RedisManager.client())
        print(json.dumps(report, ensure_ascii=False))
    finally:
        if apply:
            await RedisManager.disconnect()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Add missing notification menus without resetting existing data.")
    parser.add_argument("--apply", action="store_true", help="Commit missing menus and invalidate menu cache.")
    asyncio.run(sync_notification_menus(parser.parse_args().apply))
