"""
Init database.

Author  : Coke
Date    : 2025-04-18
"""

import asyncio

from sqlmodel import delete, select
from sqlmodel.ext.asyncio.session import AsyncSession

from src.core.database import AsyncSessionLocal
from src.domains.auth.models import User
from src.domains.auth.schemas import UserCreate
from src.domains.menu.models import Menu
from src.domains.menu.schemas import Button
from src.domains.role.models import Role
from src.domains.role.schemas import RoleCreate
from src.utils.enums import MenuIconType, MenuType
from src.utils.security import hash_password
from src.utils.uuid7 import uuid8

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
    """初始化菜单数据"""
    # 检查是否已存在菜单
    result = await session.exec(select(Menu).limit(1))
    if result.first():
        return

    # ==================== 常量路由 (constant) ====================
    login = Menu(
        id=uuid8(),
        menu_name="login",
        menu_type=MenuType.MENU,
        order=0,
        route_name="login",
        route_path="/login/:module(pwd-login|code-login|register|reset-pwd|bind-wechat)?",
        component="layout.blank$view.login",
        icon="fe:login",
        icon_type=MenuIconType.ICONIFY,
        i18n_key="",
        constant=True,
        hide_in_menu=True,
    )

    error_403 = Menu(
        id=uuid8(),
        menu_name="403",
        menu_type=MenuType.MENU,
        order=0,
        route_name="403",
        route_path="/403",
        component="layout.blank$view.403",
        icon="material-symbols:desktop-access-disabled-outline-rounded",
        icon_type=MenuIconType.ICONIFY,
        i18n_key="",
        constant=True,
        hide_in_menu=True,
    )

    error_404 = Menu(
        id=uuid8(),
        menu_name="404",
        menu_type=MenuType.MENU,
        order=0,
        route_name="404",
        route_path="/404",
        component="layout.blank$view.404",
        icon="tabler:error-404",
        icon_type=MenuIconType.ICONIFY,
        i18n_key="route.404",
        constant=True,
        hide_in_menu=True,
    )

    error_500 = Menu(
        id=uuid8(),
        menu_name="500",
        menu_type=MenuType.MENU,
        order=0,
        route_name="500",
        route_path="/500",
        component="layout.blank$view.500",
        icon="material-symbols:error-outline-rounded",
        icon_type=MenuIconType.ICONIFY,
        i18n_key="route.500",
        constant=True,
        hide_in_menu=True,
    )

    iframe_page = Menu(
        id=uuid8(),
        menu_name="iframe-page",
        menu_type=MenuType.MENU,
        order=0,
        route_name="iframe-page",
        route_path="/iframe-page/:url",
        component="layout.base$view.iframe-page",
        icon="material-symbols:iframe-outline-rounded",
        icon_type=MenuIconType.ICONIFY,
        i18n_key="route.iframe-page",
        constant=True,
        hide_in_menu=True,
        keep_alive=True,
    )

    # ==================== 业务路由 ====================
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
            Button(code="manage_user:add", desc="新增用户"),
            Button(code="manage_user:edit", desc="编辑用户"),
            Button(code="manage_user:delete", desc="删除用户"),
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
            Button(code="manage_role:add", desc="新增角色"),
            Button(code="manage_role:edit", desc="编辑角色"),
            Button(code="manage_role:delete", desc="删除角色"),
            Button(code="manage_role:permission", desc="权限配置"),
        ],
        interfaces=[
            "GET:/api/v1/roles",
            "GET:/api/v1/roles/all",
            "POST:/api/v1/roles",
            "PUT:/api/v1/roles/{role_id}",
            "DELETE:/api/v1/roles/{role_id}",
            "DELETE:/api/v1/roles",
            "GET:/api/v1/roles/{role_id}/permissions",
            "PUT:/api/v1/roles/{role_id}/permissions",
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
            Button(code="manage_menu:add", desc="新增菜单"),
            Button(code="manage_menu:edit", desc="编辑菜单"),
            Button(code="manage_menu:delete", desc="删除菜单"),
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

    # 4.1 队列概览
    queue_dashboard = Menu(
        id=uuid8(),
        parent_id=queue_id,
        menu_name="队列概览",
        menu_type=MenuType.MENU,
        order=1,
        route_name="queue_dashboard",
        route_path="/queue/dashboard",
        component="view.queue_dashboard",
        icon="material-symbols:dashboard-outline-rounded",
        icon_type=MenuIconType.ICONIFY,
        i18n_key="route.queue_dashboard",
        buttons=[
            Button(code="queue_dashboard:workerControl", desc="Worker 控制"),
        ],
        interfaces=[
            "GET:/api/v1/workers",
            "GET:/api/v1/workers/all",
            "GET:/api/v1/workers/{worker_id}",
            "POST:/api/v1/workers/{worker_id}/ping",
            "POST:/api/v1/workers/{worker_id}/shutdown",
            "POST:/api/v1/workers/{worker_id}/pool/grow",
            "POST:/api/v1/workers/{worker_id}/pool/shrink",
            "POST:/api/v1/workers/{worker_id}/queues/add",
            "POST:/api/v1/workers/{worker_id}/queues/cancel",
            "GET:/api/v1/workers/{worker_id}/tasks/active",
            "GET:/api/v1/workers/{worker_id}/tasks/reserved",
        ],
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
        buttons=[
            Button(code="queue_schedule:add", desc="新增定时任务"),
            Button(code="queue_schedule:edit", desc="编辑定时任务"),
            Button(code="queue_schedule:delete", desc="删除定时任务"),
        ],
        interfaces=[
            "GET:/api/v1/schedules",
            "GET:/api/v1/schedules/{schedule_id}",
            "POST:/api/v1/schedules",
            "PUT:/api/v1/schedules/{schedule_id}",
            "PATCH:/api/v1/schedules/{schedule_id}/toggle",
            "DELETE:/api/v1/schedules/{schedule_id}",
        ],
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
        buttons=[
            Button(code="queue_task:trigger", desc="手动触发任务"),
            Button(code="queue_task:revoke", desc="撤销任务"),
        ],
        interfaces=[
            "GET:/api/v1/tasks",
            "GET:/api/v1/tasks/{task_id}",
            "GET:/api/v1/tasks/stats/summary",
            "GET:/api/v1/tasks/stats/timeline",
            "GET:/api/v1/tasks/stats/by-name",
            "GET:/api/v1/tasks/stats/by-worker",
            "GET:/api/v1/tasks/registered",
            "POST:/api/v1/tasks/trigger",
            "POST:/api/v1/tasks/{task_id}/revoke",
        ],
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
        buttons=[
            Button(code="script:add", desc="新增脚本"),
            Button(code="script:edit", desc="编辑脚本"),
            Button(code="script:delete", desc="删除脚本"),
            Button(code="script:execute", desc="执行脚本"),
        ],
        interfaces=[
            "GET:/api/v1/scripts",
            "GET:/api/v1/scripts/{script_id}",
            "POST:/api/v1/scripts",
            "PUT:/api/v1/scripts/{script_id}",
            "DELETE:/api/v1/scripts/{script_id}",
            "DELETE:/api/v1/scripts",
            "POST:/api/v1/scripts/{script_id}/execute",
            "GET:/api/v1/scripts/{script_id}/executions",
        ],
    )

    session.add_all(
        [
            # 常量路由
            login,
            error_403,
            error_404,
            error_500,
            iframe_page,
            # 业务路由
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
