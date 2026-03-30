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

roles: list[RoleCreate] = [
    RoleCreate(
        name="admin",
        description="Administrator",
        code="ADMIN",
        interface_permissions=["GET:/api/v1/router/backend"],
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
        ]
    )
    await session.commit()


async def init_db(session: AsyncSession) -> None:
    # await create_user(session)
    await create_menus(session)


async def main() -> None:
    async with AsyncSessionLocal() as session:
        await init_db(session)


if __name__ == "__main__":
    asyncio.run(main())
