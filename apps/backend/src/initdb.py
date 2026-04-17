"""
Init database.

Author  : Coke
Date    : 2025-04-18
"""

import asyncio

from plugin_auth.auth.models import User
from plugin_auth.auth.schemas import UserCreate
from plugin_auth.role.models import Role
from plugin_auth.role.schemas import RoleCreate
from plugin_menu.models import Menu
from rapidkit_core.database import AsyncSessionLocal
from rapidkit_core.security import hash_password
from sqlmodel import delete, select
from sqlmodel.ext.asyncio.session import AsyncSession

from src._menu_seeds import build_menus

USERNAME = "admin"
PASSWORD = "123456"

ALL_BUTTON_PERMISSIONS = [
    # 系统管理
    "manage_user:add",
    "manage_user:edit",
    "manage_user:delete",
    "manage_role:add",
    "manage_role:edit",
    "manage_role:delete",
    "manage_role:permission",
    "manage_menu:add",
    "manage_menu:edit",
    "manage_menu:delete",
    # 脚本管理
    "script:add",
    "script:edit",
    "script:delete",
    "script:execute",
    # 任务队列
    "queue_dashboard:workerControl",
    "queue_schedule:add",
    "queue_schedule:edit",
    "queue_schedule:delete",
    "queue_task:trigger",
    "queue_task:revoke",
]

GUEST_INTERFACE_PERMISSIONS = [
    # 用户管理 (只读)
    "GET:/api/v1/users",
    "GET:/api/v1/users/{user_id}",
    # 角色管理 (只读)
    "GET:/api/v1/roles",
    "GET:/api/v1/roles/all",
    "GET:/api/v1/roles/{role_id}/permissions",
    # 菜单管理 (只读)
    "GET:/api/v1/manage/menus",
    "GET:/api/v1/manage/menus/tree",
    "GET:/api/v1/manage/menus/pages",
    # Worker 概览 (只读)
    "GET:/api/v1/workers",
    "GET:/api/v1/workers/all",
    "GET:/api/v1/workers/{worker_id}",
    "GET:/api/v1/workers/{worker_id}/tasks/active",
    "GET:/api/v1/workers/{worker_id}/tasks/reserved",
    # 定时任务 (只读)
    "GET:/api/v1/schedules",
    "GET:/api/v1/schedules/{schedule_id}",
    # 任务历史 (只读)
    "GET:/api/v1/tasks",
    "GET:/api/v1/tasks/{task_id}",
    "GET:/api/v1/tasks/stats/summary",
    "GET:/api/v1/tasks/stats/timeline",
    "GET:/api/v1/tasks/stats/by-name",
    "GET:/api/v1/tasks/stats/by-worker",
    "GET:/api/v1/tasks/registered",
    # 脚本管理 (只读)
    "GET:/api/v1/scripts",
    "GET:/api/v1/scripts/{script_id}",
    "GET:/api/v1/scripts/{script_id}/executions",
    # 监控中心 (只读)
    "GET:/api/v1/system/stats/api/overview",
    "GET:/api/v1/system/stats/api/top",
    "GET:/api/v1/system/stats/api/distribution",
    "GET:/api/v1/system/stats/api/trend",
    "GET:/api/v1/system/stats/api/list",
    # 插件管理 (只读)
    "GET:/api/v1/system/plugins",
    "GET:/api/v1/system/plugins/dependencies",
    "GET:/api/v1/system/events",
]

roles: list[RoleCreate] = [
    RoleCreate(
        name="admin",
        description="Administrator",
        code="ADMIN",
        interface_permissions=[],
        button_permissions=ALL_BUTTON_PERMISSIONS,
    ),
    RoleCreate(
        name="guest",
        description="Guest (read-only)",
        code="GUEST",
        router_permissions=[
            "home",
            "manage",
            "manage_user",
            "manage_role",
            "manage_menu",
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
        ],
        interface_permissions=GUEST_INTERFACE_PERMISSIONS,
        button_permissions=[],
    ),
]

users: list[UserCreate] = [
    UserCreate(
        name="admin", email="admin@gmail.com", username=USERNAME, password=PASSWORD, is_admin=True, roles=["ADMIN"]
    ),
    UserCreate(
        name="guest", email="guest@gmail.com", username="guest", password=PASSWORD, is_admin=False, roles=["GUEST"]
    ),
]


async def create_user(session: AsyncSession) -> None:
    result = await session.exec(select(User).limit(1))
    if result.first():
        return

    for role in roles:
        session.add(Role.model_validate(role))

    for user in users:
        user_dict = user.model_dump()
        user_dict["password"] = hash_password(user.password)
        session.add(User.model_validate(user_dict))

    await session.commit()


async def create_menus(session: AsyncSession) -> None:
    """初始化菜单数据。"""
    result = await session.exec(select(Menu).limit(1))
    if result.first():
        return

    session.add_all(build_menus())
    await session.commit()


async def clean_db(session: AsyncSession) -> None:
    """清理数据库中的初始化数据，方便重新初始化。"""
    await session.exec(delete(Menu))
    await session.exec(delete(Role))
    await session.exec(delete(User))
    await session.commit()


async def init_db(session: AsyncSession) -> None:
    # 取消注释以下行可清理数据库后重新初始化
    await clean_db(session)
    await create_user(session)
    await create_menus(session)


async def main() -> None:
    async with AsyncSessionLocal() as session:
        await init_db(session)


if __name__ == "__main__":
    asyncio.run(main())
