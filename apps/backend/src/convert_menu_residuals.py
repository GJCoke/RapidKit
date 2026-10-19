"""
菜单残留接口 → 权限扩展：python -m src.convert_menu_residuals --dry-run | --apply

必须在 P3 删除 Menu.interfaces 之前执行。

Author : Coke
Date   : 2026-10-17
"""

import argparse
import asyncio
import json
from importlib import import_module
from pathlib import Path

from fastapi.routing import APIRoute
from plugin_permission.catalog.registry import build_catalog
from plugin_permission.catalog.route_check import collect_route_bindings
from plugin_permission.catalog.runtime import CATALOG_VERSION_KEY, to_catalog_extension
from plugin_permission.extension.crud import PermissionExtensionCRUD
from plugin_permission.extension.models import PermissionExtension
from plugin_permission.legacy_routes import LEGACY_MENU_CODES
from plugin_permission.utils import build_route_key
from rapidkit_core.cache import bump_version
from rapidkit_core.database import AsyncSessionLocal, RedisManager

from src._legacy_menu_storage import read_legacy_menus
from src._menu_residuals import ResidualReport, plan_menu_residuals


async def convert_menu_residuals(apply: bool) -> ResidualReport:
    """加载应用路由、目录与菜单，输出报告；``apply`` 时写入扩展并递增目录版本。"""
    app = import_module("src.main").app
    route_bindings = collect_route_bindings(app.routes)
    all_route_keys = {build_route_key(r.methods, r.path) for r in app.routes if isinstance(r, APIRoute)}
    seed_interfaces = {
        name: set(interfaces)
        for name, interfaces in json.loads(Path(__file__).with_name("legacy_menu_interfaces.json").read_text()).items()
    }

    async with AsyncSessionLocal() as session:
        menus = await read_legacy_menus(session, require_interfaces=True)
        existing = [to_catalog_extension(row) for row in await PermissionExtensionCRUD(session).list_ordered()]
        catalog = build_catalog(app.state.plugins, route_bindings, existing)
        report = plan_menu_residuals(
            menus=menus,
            seed_interfaces=seed_interfaces,
            menu_codes=LEGACY_MENU_CODES,
            catalog=catalog,
            route_bindings=route_bindings,
            all_route_keys=all_route_keys,
            existing=existing,
        )
        if apply and report.to_create:
            session.add_all(
                [
                    PermissionExtension(
                        kind=ext.kind,
                        code=ext.code,
                        route_key=ext.route_key,
                        note=report.notes[ext.route_key or ""],
                    )
                    for ext in report.to_create
                ]
            )
            await session.commit()

    if apply and report.to_create:
        RedisManager.connect()
        try:
            await bump_version(RedisManager.client(), CATALOG_VERSION_KEY)
        finally:
            await RedisManager.disconnect()
    return report


def _print_report(report: ResidualReport, apply: bool) -> None:
    print(
        json.dumps(
            {
                "mode": "apply" if apply else "dry-run",
                "toCreate": [
                    {"code": ext.code, "routeKey": ext.route_key, "note": report.notes[ext.route_key or ""]}
                    for ext in report.to_create
                ],
                "skipped": [
                    {"routeName": s.route_name, "routeKey": s.route_key, "reason": s.reason} for s in report.skipped
                ],
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Convert manually added menu interfaces into permission extensions.")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--dry-run", action="store_true", help="Print the plan without writing.")
    group.add_argument("--apply", action="store_true", help="Create route_binding extensions and bump catalog version.")
    args = parser.parse_args()
    _print_report(asyncio.run(convert_menu_residuals(args.apply)), args.apply)
