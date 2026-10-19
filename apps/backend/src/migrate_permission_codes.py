# apps/backend/src/migrate_permission_codes.py
"""
角色权限迁移命令：旧三列 → ``Role.permission_codes``。

    PYTHONPATH=. uv run python -m src.migrate_permission_codes --dry-run
    PYTHONPATH=. uv run python -m src.migrate_permission_codes --apply [--force]

Author : Coke
Date   : 2026-10-17
"""

import argparse
import asyncio
from importlib import import_module

from plugin_permission.catalog.loader import catalog_from_app, collect_exempt_route_keys
from plugin_permission.models import Role
from plugin_permission.role_versions import incr_role_version
from rapidkit_common.enums import MenuType
from rapidkit_core.database import AsyncSessionLocal, RedisManager
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from src._legacy_menu_storage import read_legacy_menus
from src._permission_migration import LegacyRole, find_residual_interfaces, format_report, plan_role


async def bump_role_versions(role_codes: list[str]) -> None:
    """写库后递增角色版本，使快照与用户缓存失效。"""
    RedisManager.connect()
    redis = RedisManager.client()
    try:
        for code in role_codes:
            await incr_role_version(redis, code)
    finally:
        await RedisManager.disconnect()


async def migrate(session: AsyncSession, *, apply: bool, force: bool) -> None:
    """
    输出迁移报告；``apply`` 时写入 ``permission_codes``。

    Args:
        session: 数据库会话。
        apply: 是否写库。
        force: 是否覆盖已有 ``permission_codes`` 的角色。
    """
    app = import_module("src.main").app
    catalog, bindings = catalog_from_app(app)
    exempt = collect_exempt_route_keys(app.routes)
    roles = list((await session.exec(select(Role))).all())
    menus = await read_legacy_menus(session)
    directory_routes = {menu.route_name for menu in menus if menu.menu_type == MenuType.DIRECTORY or menu.constant}

    plans = {
        role.code: plan_role(
            LegacyRole(
                code=role.code,
                router_permissions=role.router_permissions or [],
                button_permissions=role.button_permissions or [],
                interface_permissions=role.interface_permissions or [],
            ),
            bindings=bindings,
            exempt=exempt,
            catalog=catalog,
            directory_routes=directory_routes,
        )
        for role in roles
    }
    residuals = find_residual_interfaces(
        [(menu.route_name, menu.interfaces or []) for menu in menus], bindings=bindings, exempt=exempt
    )
    print(format_report(list(plans.values()), residuals))

    if not apply:
        print("\n干跑完成，未写入数据库。确认报告后使用 --apply 执行。")
        return

    changed: list[str] = []
    for role in roles:
        if role.permission_codes and not force:
            print(f"跳过 {role.code}：已有 permission_codes（使用 --force 覆盖）")
            continue
        role.permission_codes = plans[role.code].codes
        session.add(role)
        changed.append(role.code)
    await session.commit()
    await bump_role_versions(changed)
    print(f"\n已写入 {len(changed)} 个角色：{', '.join(changed) or '-'}")


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    """解析命令行：``--dry-run`` 与 ``--apply`` 二选一。"""
    parser = argparse.ArgumentParser(description="Migrate role permissions to permission codes.")
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--dry-run", action="store_false", dest="apply", help="Only print the migration report.")
    mode.add_argument("--apply", action="store_true", dest="apply", help="Write permission_codes to roles.")
    parser.add_argument("--force", action="store_true", help="Overwrite roles that already have permission_codes.")
    return parser.parse_args(argv)


async def main(argv: list[str] | None = None) -> None:
    """命令入口。"""
    args = parse_args(argv)
    async with AsyncSessionLocal() as session:
        await migrate(session, apply=args.apply, force=args.force)


if __name__ == "__main__":
    asyncio.run(main())
