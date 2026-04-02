"""
Init database.

Author  : Coke
Date    : 2025-04-18
"""

import asyncio

from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from src.core.database import AsyncSessionLocal
from src.domains.auth.models import User
from src.domains.auth.schemas import UserCreate
from src.domains.menu.models import Menu
from src.domains.role.models import Role
from src.domains.role.schemas import RoleCreate
from src.utils.enums import MenuIconType, MenuType
from src.utils.security import hash_password
from src.utils.uuid7 import uuid8

USERNAME = "admin"
PASSWORD = "123456"

ALL_BUTTON_PERMISSIONS = [
    "manage_user:add",
    "manage_user:edit",
    "manage_user:delete",
    "manage_role:add",
    "manage_role:edit",
    "manage_role:delete",
    "manage_role:menuAuth",
    "manage_role:buttonAuth",
    "manage_role:interfaceAuth",
    "manage_menu:add",
    "manage_menu:edit",
    "manage_menu:delete",
]

roles: list[RoleCreate] = [
    RoleCreate(
        name="admin",
        description="Administrator",
        code="ADMIN",
        interface_permissions=["GET:/api/v1/router/backend"],
        button_permissions=ALL_BUTTON_PERMISSIONS,
    ),
]

users: list[UserCreate] = [
    UserCreate(
        name="admin", email="admin@gmail.com", username=USERNAME, password=PASSWORD, is_admin=True, roles=["ADMIN"]
    ),  # type: ignore
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
    """初始化菜单数据"""
    # 检查是否已存在菜单
    result = await session.exec(select(Menu).limit(1))
    if result.first():
        return

    manage_id = uuid8()
    # 1. 首页
    home = Menu(
        id=uuid8(),
        menu_name="首页",
        menu_type=MenuType.MENU,
        order=1,
        route_name="home",
        route_path="/home",
        component="layout.base$view.home",
        icon="mdi:monitor-dashboard",
        icon_type=MenuIconType.ICONIFY,
        i18n_key="route.home",
    )

    # 2. 系统管理 (目录)
    manage = Menu(
        id=manage_id,
        menu_name="系统管理",
        menu_type=MenuType.DIRECTORY,
        order=2,
        route_name="manage",
        route_path="/manage",
        component="layout.base",
        icon="tabler:settings-spark",
        icon_type=MenuIconType.ICONIFY,
        i18n_key="route.manage",
    )

    # 2.1 用户管理
    manage_user = Menu(
        id=uuid8(),
        parent_id=manage_id,
        menu_name="用户管理",
        menu_type=MenuType.MENU,
        order=1,
        route_name="manage_user",
        route_path="/manage/user",
        component="view.manage_user",
        icon="ic:round-manage-accounts",
        i18n_key="route.manage_user",
        buttons=[
            {"code": "manage_user:add", "desc": "新增用户"},
            {"code": "manage_user:edit", "desc": "编辑用户"},
            {"code": "manage_user:delete", "desc": "删除用户"},
        ],
        interfaces=[
            "GET:/api/v1/users",
            "GET:/api/v1/users/{user_id}",
            "POST:/api/v1/users",
            "PUT:/api/v1/users/{user_id}",
            "DELETE:/api/v1/users/{user_id}",
            "DELETE:/api/v1/users",
        ],
    )

    # 2.2 角色管理
    manage_role = Menu(
        id=uuid8(),
        parent_id=manage_id,
        menu_name="角色管理",
        menu_type=MenuType.MENU,
        order=2,
        route_name="manage_role",
        route_path="/manage/role",
        component="view.manage_role",
        icon="carbon:user-role",
        i18n_key="route.manage_role",
        buttons=[
            {"code": "manage_role:add", "desc": "新增角色"},
            {"code": "manage_role:edit", "desc": "编辑角色"},
            {"code": "manage_role:delete", "desc": "删除角色"},
            {"code": "manage_role:menuAuth", "desc": "菜单权限"},
            {"code": "manage_role:buttonAuth", "desc": "按钮权限"},
            {"code": "manage_role:interfaceAuth", "desc": "接口权限"},
        ],
        interfaces=[
            "GET:/api/v1/roles",
            "GET:/api/v1/roles/all",
            "POST:/api/v1/roles",
            "PUT:/api/v1/roles/{role_id}",
            "DELETE:/api/v1/roles/{role_id}",
            "DELETE:/api/v1/roles",
            "GET:/api/v1/roles/{role_id}/permissions",
            "PUT:/api/v1/roles/{role_id}/permissions/router",
            "PUT:/api/v1/roles/{role_id}/permissions/button",
            "PUT:/api/v1/roles/{role_id}/permissions/interface",
        ],
    )

    # 2.3 菜单管理
    manage_menu = Menu(
        id=uuid8(),
        parent_id=manage_id,
        menu_name="菜单管理",
        menu_type=MenuType.MENU,
        order=3,
        route_name="manage_menu",
        route_path="/manage/menu",
        component="view.manage_menu",
        icon="material-symbols:menu-book",
        i18n_key="route.manage_menu",
        buttons=[
            {"code": "manage_menu:add", "desc": "新增菜单"},
            {"code": "manage_menu:edit", "desc": "编辑菜单"},
            {"code": "manage_menu:delete", "desc": "删除菜单"},
        ],
        interfaces=[
            "GET:/api/v1/manage/menus",
            "POST:/api/v1/manage/menus",
            "PUT:/api/v1/manage/menus/{menu_id}",
            "DELETE:/api/v1/manage/menus/{menu_id}",
            "DELETE:/api/v1/manage/menus",
            "GET:/api/v1/manage/menus/tree",
            "GET:/api/v1/manage/menus/pages",
        ],
    )

    socketio_id = uuid8()

    # 3. 即时通讯 (目录)
    socketio = Menu(
        id=socketio_id,
        menu_name="即时通讯",
        menu_type=MenuType.DIRECTORY,
        order=6,
        route_name="socketio",
        route_path="/socketio",
        component="layout.base",
        icon="ri:message-ai-3-line",
        icon_type=MenuIconType.ICONIFY,
        i18n_key="route.socketio",
    )

    # 3.1 聊天室
    socketio_chat = Menu(
        id=uuid8(),
        parent_id=socketio_id,
        menu_name="聊天室",
        menu_type=MenuType.MENU,
        order=5,
        route_name="socketio_chat",
        route_path="/socketio/chat",
        component="view.socketio_chat",
        icon="fluent:chat-multiple-24-regular",
        i18n_key="route.socketio_chat",
    )

    # 3.2 调试面板
    socketio_debug = Menu(
        id=uuid8(),
        parent_id=socketio_id,
        menu_name="调试面板",
        menu_type=MenuType.MENU,
        order=4,
        route_name="socketio_debug",
        route_path="/socketio/debug",
        component="view.socketio_debug",
        icon="codicon:debug-all",
        i18n_key="route.socketio_debug",
    )

    # 3.3 仪表盘
    socketio_instrument = Menu(
        id=uuid8(),
        parent_id=socketio_id,
        menu_name="仪表盘",
        menu_type=MenuType.MENU,
        order=3,
        route_name="socketio_instrument",
        route_path="/socketio/instrument",
        component="view.socketio_instrument",
        icon="stash:dashboard",
        i18n_key="route.socketio_instrument",
    )

    queue_id = uuid8()

    # 4. 任务队列 (目录)
    queue = Menu(
        id=queue_id,
        menu_name="任务队列",
        menu_type=MenuType.DIRECTORY,
        order=7,
        route_name="queue",
        route_path="/queue",
        component="layout.base",
        icon="material-symbols:queue-play-next-outline",
        icon_type=MenuIconType.ICONIFY,
        i18n_key="route.queue",
    )

    # 4.1 仪表盘
    queue_dashboard = Menu(
        id=uuid8(),
        parent_id=queue_id,
        menu_name="仪表盘",
        menu_type=MenuType.MENU,
        order=1,
        route_name="queue_dashboard",
        route_path="/queue/dashboard",
        component="view.queue_dashboard",
        icon="material-symbols:dashboard-outline-rounded",
        icon_type=MenuIconType.ICONIFY,
        i18n_key="route.queue_dashboard",
    )

    # 4.2 定时任务
    queue_schedule = Menu(
        id=uuid8(),
        parent_id=queue_id,
        menu_name="定时任务",
        menu_type=MenuType.MENU,
        order=2,
        route_name="queue_schedule",
        route_path="/queue/schedule",
        component="view.queue_schedule",
        icon="material-symbols:alarm-smart-wake-outline",
        icon_type=MenuIconType.ICONIFY,
        i18n_key="route.queue_schedule",
    )

    # 4.3 任务历史
    queue_task = Menu(
        id=uuid8(),
        parent_id=queue_id,
        menu_name="任务历史",
        menu_type=MenuType.MENU,
        order=3,
        route_name="queue_task",
        route_path="/queue/task",
        component="view.queue_task",
        icon="material-symbols:history-2",
        icon_type=MenuIconType.ICONIFY,
        i18n_key="route.queue_task",
    )

    # 5. 脚本管理
    script = Menu(
        id=uuid8(),
        menu_name="脚本管理",
        menu_type=MenuType.MENU,
        order=12,
        route_name="script",
        route_path="/script",
        component="layout.base$view.script",
        icon="streamline-ultimate:programming-browser-1-bold",
        icon_type=MenuIconType.ICONIFY,
        i18n_key="route.script",
    )

    session.add_all(
        [
            home,
            manage,
            manage_user,
            manage_role,
            manage_menu,
            socketio,
            socketio_chat,
            socketio_debug,
            socketio_instrument,
            queue,
            queue_dashboard,
            queue_schedule,
            queue_task,
            script,
        ]
    )
    await session.commit()


async def init_db(session: AsyncSession) -> None:
    await create_user(session)
    await create_menus(session)


async def main() -> None:
    async with AsyncSessionLocal() as session:
        await init_db(session)


if __name__ == "__main__":
    asyncio.run(main())
