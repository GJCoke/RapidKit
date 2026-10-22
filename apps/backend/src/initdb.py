"""
Init database.

Author  : Coke
Date    : 2025-04-18
"""

import argparse
import asyncio
from importlib import import_module

from plugin_department.models import Department
from plugin_menu.models import Menu
from plugin_menu.services import invalidate_menu_cache
from plugin_permission.catalog.loader import catalog_from_app
from plugin_permission.catalog.registry import PermissionCatalog
from plugin_permission.models import Role
from plugin_user.models import User
from rapidkit_common.enums import Status
from rapidkit_core.database import AsyncSessionLocal, RedisManager
from rapidkit_security import hash_password
from sqlmodel import delete, select
from sqlmodel.ext.asyncio.session import AsyncSession

from src._menu_permissions import plan_menu_sync, seed_menu_permission_codes

USERNAME = "admin"
PASSWORD = "123456"

GUEST_ROUTER_PERMISSIONS = [
    "home",
    "manage",
    "manage_user",
    "manage_role",
    "manage_menu",
    "manage_audit-log",
    "socketio",
    "socketio_chat",
    "socketio_debug",
    "socketio_instrument",
    "queue",
    "queue_dashboard",
    "queue_schedule",
    "queue_task",
    "monitoring",
    "monitoring_api",
    "monitoring_plugin",
]


GUEST_PERMISSION_CODES = seed_menu_permission_codes(GUEST_ROUTER_PERMISSIONS)


def seed_role_codes(catalog: PermissionCatalog) -> tuple[list[str], list[str]]:
    """
    种子角色的权限码。

    Returns:
        (ADMIN：目录内全部码, GUEST：访客菜单对应的查看码，依赖由 depends 展开)。
    """
    guest = set(GUEST_PERMISSION_CODES)
    return sorted(catalog.codes), sorted(guest & set(catalog.codes))


async def create_roles_and_users(session: AsyncSession, catalog: PermissionCatalog) -> None:
    """初始化角色和用户。"""
    result = await session.exec(select(User).limit(1))
    has_users = result.first() is not None
    admin_codes, guest_codes = seed_role_codes(catalog)

    admin_role = Role.model_validate(
        {
            "name": "admin",
            "description": "Administrator",
            "code": "ADMIN",
            "permission_codes": admin_codes,
        }
    )

    guest_role = Role.model_validate(
        {
            "name": "guest",
            "description": "Guest (field mode demo)",
            "code": "GUEST",
            "permission_codes": guest_codes,
            "field_modes": {"user": {"contact": "masked"}},
        }
    )

    for role in (admin_role, guest_role):
        existing = (await session.exec(select(Role).where(Role.code == role.code))).first()
        if existing is None:
            session.add(role)

    if has_users:
        await session.commit()
        return

    users_data = [
        {
            "name": "admin",
            "email": "admin@gmail.com",
            "username": USERNAME,
            "password": PASSWORD,
            "is_admin": True,
            "roles": ["ADMIN"],
            "phone": "13800000001",
            "nickname": "Super Admin",
            "gender": "male",
        },
        {
            "name": "guest",
            "email": "guest@gmail.com",
            "username": "guest",
            "password": PASSWORD,
            "is_admin": False,
            "roles": ["GUEST"],
            "phone": "13800000002",
            "nickname": "Guest User",
            "gender": "male",
        },
        {
            "name": "张三",
            "email": "zhangsan@gmail.com",
            "username": "zhangsan",
            "password": PASSWORD,
            "is_admin": False,
            "roles": ["GUEST"],
            "phone": "13800000003",
            "nickname": "小张",
            "gender": "male",
        },
        {
            "name": "李四",
            "email": "lisi@gmail.com",
            "username": "lisi0",
            "password": PASSWORD,
            "is_admin": False,
            "roles": ["GUEST"],
            "phone": "13800000004",
            "nickname": "小李",
            "gender": "female",
        },
    ]

    for user_data in users_data:
        session.add(
            User.model_validate(
                {
                    **user_data,
                    "password": hash_password(str(user_data.get("password"))),
                }
            )
        )

    await session.commit()


async def create_departments(session: AsyncSession) -> None:
    """初始化默认部门。"""
    result = await session.exec(select(Department).limit(1))
    if result.first():
        return

    root = Department(
        name="总公司",
        code="HQ",
        sort=1,
        status=Status.ON,
    )
    session.add(root)
    await session.commit()


async def create_menus(session: AsyncSession) -> None:
    """初始化菜单数据。"""
    existing = list((await session.exec(select(Menu).with_for_update())).all())
    missing, updates = plan_menu_sync(existing)
    for menu, permission in updates:
        menu.permission = permission
    session.add_all([*missing, *(menu for menu, _ in updates)])
    await session.commit()


async def clean_db(session: AsyncSession) -> None:
    """清理数据库中的初始化数据，方便重新初始化。"""
    await session.exec(delete(Menu))
    await session.exec(delete(Role))
    await session.exec(delete(User))
    await session.exec(delete(Department))
    await session.commit()


async def init_db(session: AsyncSession, *, reset: bool = False) -> None:
    """Fill missing seed data and menu permissions; reset only when explicitly requested."""
    if reset:
        await clean_db(session)
    await create_departments(session)
    await session.commit()
    catalog, _ = catalog_from_app(import_module("src.main").app)
    await create_roles_and_users(session, catalog)
    await create_menus(session)


async def flush_redis_cache(*, reset: bool = False) -> None:
    """清除 Redis 中的业务缓存，避免 initdb 后读到旧数据。"""
    RedisManager.connect()
    redis = RedisManager.client()
    try:
        await invalidate_menu_cache(redis)
        patterns = ["auth:permission:*", "auth:role:*", "auth:permission_catalog_*"]
        if reset:
            patterns.append("auth:user:*")
        for pattern in patterns:
            async for key in redis.scan_iter(match=pattern):
                await redis.delete(key)
    finally:
        await RedisManager.disconnect()


async def main(*, reset: bool = False) -> None:
    async with AsyncSessionLocal() as session:
        await init_db(session, reset=reset)
    await flush_redis_cache(reset=reset)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Initialize missing seed data and synchronize menu permissions.")
    parser.add_argument(
        "--reset", action="store_true", help="Delete seed tables and recreate demo accounts (destructive)."
    )
    asyncio.run(main(reset=parser.parse_args().reset))
