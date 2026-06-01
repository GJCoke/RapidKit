"""
菜单种子数据。

Author : Coke
Date   : 2026-04-17
"""

from plugin_menu.models import Menu
from plugin_menu.schemas import Button
from rapidkit_common.enums import MenuIconType, MenuType
from rapidkit_core.uuid7 import uuid8


def build_menus() -> list[Menu]:
    """构建初始菜单列表。"""

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
            Button(code="manage_user:add", desc="新增用户").model_dump(),
            Button(code="manage_user:edit", desc="编辑用户").model_dump(),
            Button(code="manage_user:delete", desc="删除用户").model_dump(),
        ],
        interfaces=[
            "GET:/api/v1/users",
            "GET:/api/v1/users/all",
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
            Button(code="manage_role:add", desc="新增角色").model_dump(),
            Button(code="manage_role:edit", desc="编辑角色").model_dump(),
            Button(code="manage_role:delete", desc="删除角色").model_dump(),
            Button(code="manage_role:permission", desc="权限配置").model_dump(),
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
            Button(code="manage_menu:add", desc="新增菜单").model_dump(),
            Button(code="manage_menu:edit", desc="编辑菜单").model_dump(),
            Button(code="manage_menu:delete", desc="删除菜单").model_dump(),
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

    # 2.4 部门管理
    manage_department = Menu(
        id=uuid8(),
        parent_id=manage_id,
        menu_name="部门管理",
        menu_type=MenuType.MENU,
        order=4,
        route_name="manage_department",
        route_path="/manage/department",
        component="view.manage_department",
        icon="ic:outline-corporate-fare",
        i18n_key="route.manage_department",
        buttons=[
            Button(code="manage_department:add", desc="新增部门").model_dump(),
            Button(code="manage_department:edit", desc="编辑部门").model_dump(),
            Button(code="manage_department:delete", desc="删除部门").model_dump(),
        ],
        interfaces=[
            "GET:/api/v1/departments/tree",
            "POST:/api/v1/departments",
            "PUT:/api/v1/departments/{dept_id}",
            "DELETE:/api/v1/departments/{dept_id}",
        ],
    )

    # 2.5 数据策略
    manage_data_policy = Menu(
        id=uuid8(),
        parent_id=manage_id,
        menu_name="数据策略",
        menu_type=MenuType.MENU,
        order=5,
        route_name="manage_data-policy",
        route_path="/manage/data-policy",
        component="view.manage_data-policy",
        icon="ic:outline-rule",
        i18n_key="route.manage_data-policy",
        buttons=[
            Button(code="manage_data-policy:add", desc="新增数据策略").model_dump(),
            Button(code="manage_data-policy:edit", desc="编辑数据策略").model_dump(),
            Button(code="manage_data-policy:delete", desc="删除数据策略").model_dump(),
        ],
        interfaces=[
            "GET:/api/v1/data-policies",
            "GET:/api/v1/data-policies/all",
            "GET:/api/v1/data-policies/models",
            "POST:/api/v1/data-policies",
            "PUT:/api/v1/data-policies/{policy_id}",
            "DELETE:/api/v1/data-policies/{policy_id}",
        ],
    )

    # 2.6 字段策略
    manage_field_policy = Menu(
        id=uuid8(),
        parent_id=manage_id,
        menu_name="字段策略",
        menu_type=MenuType.MENU,
        order=6,
        route_name="manage_field-policy",
        route_path="/manage/field-policy",
        component="view.manage_field-policy",
        icon="ic:outline-shield",
        i18n_key="route.manage_field-policy",
        buttons=[
            Button(code="manage_field-policy:add", desc="新增字段策略").model_dump(),
            Button(code="manage_field-policy:edit", desc="编辑字段策略").model_dump(),
            Button(code="manage_field-policy:delete", desc="删除字段策略").model_dump(),
        ],
        interfaces=[
            "GET:/api/v1/field-policies",
            "GET:/api/v1/field-policies/all",
            "POST:/api/v1/field-policies",
            "PUT:/api/v1/field-policies/{policy_id}",
            "DELETE:/api/v1/field-policies/{policy_id}",
        ],
    )

    # 2.7 审计字典
    manage_audit_dict = Menu(
        id=uuid8(),
        parent_id=manage_id,
        menu_name="审计字典",
        menu_type=MenuType.MENU,
        order=7,
        route_name="manage_audit-dict",
        route_path="/manage/audit-dict",
        component="view.manage_audit-dict",
        icon="carbon:catalog",
        i18n_key="route.manage_audit-dict",
        buttons=[
            Button(code="manage_audit-dict:add", desc="新增审计字典").model_dump(),
            Button(code="manage_audit-dict:edit", desc="编辑审计字典").model_dump(),
            Button(code="manage_audit-dict:delete", desc="删除审计字典").model_dump(),
        ],
        interfaces=[
            "GET:/api/v1/system/audit-dict",
            "POST:/api/v1/system/audit-dict",
            "PUT:/api/v1/system/audit-dict/{item_id}",
            "DELETE:/api/v1/system/audit-dict/{item_id}",
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
            Button(code="queue_dashboard:workerControl", desc="Worker 控制").model_dump(),
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
            Button(code="queue_schedule:add", desc="新增定时任务").model_dump(),
            Button(code="queue_schedule:edit", desc="编辑定时任务").model_dump(),
            Button(code="queue_schedule:delete", desc="删除定时任务").model_dump(),
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
            Button(code="queue_task:trigger", desc="手动触发任务").model_dump(),
            Button(code="queue_task:revoke", desc="撤销任务").model_dump(),
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
            Button(code="script:add", desc="新增脚本").model_dump(),
            Button(code="script:edit", desc="编辑脚本").model_dump(),
            Button(code="script:delete", desc="删除脚本").model_dump(),
            Button(code="script:execute", desc="执行脚本").model_dump(),
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

    monitoring_id = uuid8()

    # 6. 监控中心 (目录)
    monitoring = Menu(
        id=monitoring_id,
        menu_name="监控中心",
        menu_type=MenuType.DIRECTORY,
        order=8,
        route_name="monitoring",
        route_path="/monitoring",
        component="layout.base",
        icon="material-symbols:monitoring",
        icon_type=MenuIconType.ICONIFY,
        i18n_key="route.monitoring",
    )

    # 6.1 API 监控
    monitoring_api = Menu(
        id=uuid8(),
        parent_id=monitoring_id,
        menu_name="API 监控",
        menu_type=MenuType.MENU,
        order=1,
        route_name="monitoring_api",
        route_path="/monitoring/api",
        component="view.monitoring_api",
        icon="streamline-ultimate:coding-apps-website-web-dev-api-cloud",
        icon_type=MenuIconType.ICONIFY,
        i18n_key="route.monitoring_api",
        interfaces=[
            "GET:/api/v1/system/stats/api/overview",
            "GET:/api/v1/system/stats/api/top",
            "GET:/api/v1/system/stats/api/distribution",
            "GET:/api/v1/system/stats/api/trend",
            "GET:/api/v1/system/stats/api/list",
        ],
    )

    # 6.2 插件管理
    monitoring_plugin = Menu(
        id=uuid8(),
        parent_id=monitoring_id,
        menu_name="插件管理",
        menu_type=MenuType.MENU,
        order=2,
        route_name="monitoring_plugin",
        route_path="/monitoring/plugin",
        component="view.monitoring_plugin",
        icon="clarity:plugin-outline-badged",
        icon_type=MenuIconType.ICONIFY,
        i18n_key="route.monitoring_plugin",
        interfaces=[
            "GET:/api/v1/system/plugins",
            "GET:/api/v1/system/plugins/dependencies",
            "GET:/api/v1/system/events",
        ],
    )

    return [
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
        manage_department,
        manage_data_policy,
        manage_field_policy,
        manage_audit_dict,
        socketio,
        socketio_chat,
        socketio_debug,
        socketio_instrument,
        queue,
        queue_dashboard,
        queue_schedule,
        queue_task,
        script,
        monitoring,
        monitoring_api,
        monitoring_plugin,
    ]
