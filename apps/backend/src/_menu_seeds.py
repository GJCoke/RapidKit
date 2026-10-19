"""
菜单种子数据。

Author : Coke
Date   : 2026-04-17
"""

from plugin_menu.models import Menu
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
        route_path=("/login/:module(pwd-login|code-login|register|reset-pwd|bind-wechat|set-password|reset-password)?"),
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
        permission="dashboard:read",
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
        permission="user:read",
    )

    # Hidden detail page: super administrators see all database routes;
    # ordinary roles require an explicit router permission as before.
    manage_user_detail = Menu(
        id=uuid8(),
        parent_id=manage_id,
        menu_name="用户详情",
        menu_type=MenuType.MENU,
        order=1,
        route_name="manage_user-detail",
        route_path="/manage/user-detail/:id",
        component="view.manage_user-detail",
        i18n_key="route.manage_user-detail",
        permission="user:read",
        hide_in_menu=True,
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
        permission="role:read",
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
        permission="menu:read",
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
        permission="department:read",
    )

    # 2.7 审计日志
    manage_audit_log = Menu(
        id=uuid8(),
        parent_id=manage_id,
        menu_name="审计日志",
        menu_type=MenuType.MENU,
        order=7,
        route_name="manage_audit-log",
        route_path="/manage/audit-log",
        component="view.manage_audit-log",
        icon="carbon:security",
        i18n_key="route.manage_audit-log",
        permission="audit-log:read",
    )

    # 2.8 权限扩展（仅超级管理员：不授予任何内置角色；P3 设置 Menu.permission = "permission-extension:manage"）
    manage_permission_extension = Menu(
        id=uuid8(),
        parent_id=manage_id,
        menu_name="权限扩展",
        menu_type=MenuType.MENU,
        order=8,
        route_name="manage_permission-extension",
        route_path="/manage/permission-extension",
        component="view.manage_permission-extension",
        icon="mdi:puzzle-outline",
        icon_type=MenuIconType.ICONIFY,
        i18n_key="route.manage_permission-extension",
        permission="permission-extension:manage",
    )

    manage_permission_package = Menu(
        id=uuid8(),
        parent_id=manage_id,
        menu_name="功能包",
        menu_type=MenuType.MENU,
        order=9,
        route_name="manage_permission-package",
        route_path="/manage/permission-package",
        component="view.manage_permission-package",
        icon="mdi:package-variant-closed",
        icon_type=MenuIconType.ICONIFY,
        i18n_key="route.manage_permission-package",
        permission="permission-package:read",
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
        permission="socketio:read",
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
        permission="socketio:read",
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
        permission="socketio:read",
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
        permission="worker:read",
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
        permission="schedule:read",
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
        permission="task:read",
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
        permission="monitoring:read",
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
        permission="plugin:read",
    )

    notification_manage_id = uuid8()

    # 7. 通知管理（动态路由由数据库菜单驱动）
    notification_manage = Menu(
        id=notification_manage_id,
        menu_name="通知管理",
        menu_type=MenuType.DIRECTORY,
        order=9,
        # Elegant Router treats names containing "_" as nested routes.  This
        # database root must remain a first-level route so layout.base wraps
        # all notification administration pages.
        route_name="notificationManage",
        route_path="/notification/manage",
        component="layout.base",
        icon="majesticons:bell-line",
        icon_type=MenuIconType.ICONIFY,
        i18n_key="route.notification_manage",
    )

    notification_manage_templates = Menu(
        id=uuid8(),
        parent_id=notification_manage_id,
        menu_name="模板管理",
        menu_type=MenuType.MENU,
        order=1,
        route_name="notification_manage_templates",
        route_path="/notification/manage/templates",
        component="view.notification_manage_templates",
        icon="material-symbols:dashboard-customize-outline",
        i18n_key="route.notification_manage_templates",
        permission="notification-template:read",
    )

    notification_manage_announcements = Menu(
        id=uuid8(),
        parent_id=notification_manage_id,
        menu_name="公告管理",
        menu_type=MenuType.MENU,
        order=2,
        route_name="notification_manage_announcements",
        route_path="/notification/manage/announcements",
        component="view.notification_manage_announcements",
        icon="material-symbols:campaign-outline",
        i18n_key="route.notification_manage_announcements",
        permission="notification:read",
    )

    notification_manage_deliveries = Menu(
        id=uuid8(),
        parent_id=notification_manage_id,
        menu_name="投递状态",
        menu_type=MenuType.MENU,
        order=3,
        route_name="notification_manage_deliveries",
        route_path="/notification/manage/deliveries",
        component="view.notification_manage_deliveries",
        icon="material-symbols:send-outline",
        i18n_key="route.notification_manage_deliveries",
        permission="notification-delivery:read",
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
        manage_user_detail,
        manage_role,
        manage_menu,
        manage_department,
        manage_audit_log,
        manage_permission_extension,
        manage_permission_package,
        socketio,
        socketio_chat,
        socketio_debug,
        socketio_instrument,
        queue,
        queue_dashboard,
        queue_schedule,
        queue_task,
        monitoring,
        monitoring_api,
        monitoring_plugin,
        notification_manage,
        notification_manage_templates,
        notification_manage_announcements,
        notification_manage_deliveries,
    ]
