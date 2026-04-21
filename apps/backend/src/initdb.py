"""
Init database.

Author  : Coke
Date    : 2025-04-18
"""

import asyncio

from plugin_auth.auth.models import User
from plugin_auth.data_rule.models import DataRule
from plugin_auth.department.models import Department
from plugin_auth.role.models import Role
from plugin_menu.models import Menu
from plugin_menu.services import invalidate_menu_cache
from plugin_system.audit_dict.models import AuditDictionary
from rapidkit_common.enums import DataScope, Status
from rapidkit_core.database import AsyncSessionLocal, RedisManager
from rapidkit_core.security import hash_password
from rapidkit_core.uuid7 import uuid7
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
    "manage_user:password",
    "manage_role:add",
    "manage_role:edit",
    "manage_role:delete",
    "manage_role:permission",
    "manage_menu:add",
    "manage_menu:edit",
    "manage_menu:delete",
    # 部门管理
    "manage_department:add",
    "manage_department:edit",
    "manage_department:delete",
    # 数据规则
    "manage_data-rule:add",
    "manage_data-rule:edit",
    "manage_data-rule:delete",
    # 审计字典
    "manage_audit-dict:add",
    "manage_audit-dict:edit",
    "manage_audit-dict:delete",
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
    "GET:/api/v1/users/all",
    "GET:/api/v1/users/{user_id}",
    # 角色管理 (只读)
    "GET:/api/v1/roles",
    "GET:/api/v1/roles/all",
    "GET:/api/v1/roles/{role_id}/permissions",
    # 菜单管理 (只读)
    "GET:/api/v1/manage/menus",
    "GET:/api/v1/manage/menus/tree",
    "GET:/api/v1/manage/menus/pages",
    # 部门管理 (只读)
    "GET:/api/v1/departments/tree",
    # 数据规则 (只读)
    "GET:/api/v1/data-rules",
    "GET:/api/v1/data-rules/all",
    # 审计字典 (只读)
    "GET:/api/v1/system/audit-dict",
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

GUEST_ROUTER_PERMISSIONS = [
    "home",
    "manage",
    "manage_user",
    "manage_role",
    "manage_menu",
    "manage_department",
    "manage_data-rule",
    "manage_audit-dict",
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


async def create_data_rules(session: AsyncSession) -> list[DataRule]:
    """初始化示例数据规则。"""
    result = await session.exec(select(DataRule).limit(1))
    if result.first():
        return list((await session.exec(select(DataRule))).all())

    rules = [
        DataRule(
            id=uuid7(),
            name="仅查看自己创建的用户",
            model_name="auth_users",
            field="created_by",
            operator="eq",
            value="${user_id}",
            logic="AND",
        ),
    ]
    session.add_all(rules)
    await session.flush()
    return rules


async def create_roles_and_users(session: AsyncSession, data_rules: list[DataRule]) -> None:
    """初始化角色和用户。"""
    result = await session.exec(select(User).limit(1))
    if result.first():
        return

    # 数据规则 ID 列表（GUEST 角色绑定）
    rule_ids = [r.id for r in data_rules]

    admin_role = Role.model_validate(
        {
            "name": "admin",
            "description": "Administrator",
            "code": "ADMIN",
            "interface_permissions": [],
            "button_permissions": ALL_BUTTON_PERMISSIONS,
            "data_scope": DataScope.ALL,
        }
    )

    guest_role = Role.model_validate(
        {
            "name": "guest",
            "description": "Guest (data scope demo)",
            "code": "GUEST",
            "router_permissions": GUEST_ROUTER_PERMISSIONS,
            "interface_permissions": GUEST_INTERFACE_PERMISSIONS,
            "button_permissions": [],
            "data_scope": DataScope.CUSTOM_RULE,
            "data_rule_ids": rule_ids,
        }
    )

    session.add(admin_role)
    session.add(guest_role)

    users_data = [
        {
            "name": "admin",
            "email": "admin@gmail.com",
            "username": USERNAME,
            "password": PASSWORD,
            "is_admin": True,
            "roles": ["ADMIN"],
        },
        {
            "name": "guest",
            "email": "guest@gmail.com",
            "username": "guest",
            "password": PASSWORD,
            "is_admin": False,
            "roles": ["GUEST"],
        },
        {
            "name": "张三",
            "email": "zhangsan@gmail.com",
            "username": "zhangsan",
            "password": PASSWORD,
            "is_admin": False,
            "roles": ["GUEST"],
        },
        {
            "name": "李四",
            "email": "lisi@gmail.com",
            "username": "lisi0",
            "password": PASSWORD,
            "is_admin": False,
            "roles": ["GUEST"],
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
    result = await session.exec(select(Menu).limit(1))
    if result.first():
        return

    session.add_all(build_menus())
    await session.commit()


async def create_audit_dictionary(session: AsyncSession) -> None:
    """初始化审计字典数据。"""
    result = await session.exec(select(AuditDictionary).limit(1))
    if result.first():
        return

    entries = [
        # Resources
        AuditDictionary(key="auth", category="resource", label_zh="系统", label_en="System"),
        AuditDictionary(key="user", category="resource", label_zh="用户", label_en="User"),
        AuditDictionary(key="users", category="resource", label_zh="用户", label_en="User"),
        AuditDictionary(key="roles", category="resource", label_zh="角色", label_en="Role"),
        AuditDictionary(key="menus", category="resource", label_zh="菜单", label_en="Menu"),
        AuditDictionary(key="departments", category="resource", label_zh="部门", label_en="Department"),
        AuditDictionary(key="data-rules", category="resource", label_zh="数据规则", label_en="Data Rule"),
        AuditDictionary(key="scripts", category="resource", label_zh="脚本", label_en="Script"),
        AuditDictionary(key="schedules", category="resource", label_zh="计划任务", label_en="Schedule"),
        AuditDictionary(key="workers", category="resource", label_zh="Worker", label_en="Worker"),
        AuditDictionary(key="system", category="resource", label_zh="系统", label_en="System"),
        AuditDictionary(key="audit-dict", category="resource", label_zh="审计字典", label_en="Audit Dict"),
        AuditDictionary(key="monitoring", category="resource", label_zh="监控", label_en="Monitoring"),
        AuditDictionary(key="tasks", category="resource", label_zh="任务", label_en="Task"),
        AuditDictionary(key="permissions", category="resource", label_zh="权限", label_en="Permission"),
        # Resources — worker/task/script 子操作路径
        AuditDictionary(key="execute", category="resource", label_zh="执行", label_en="Execution"),
        AuditDictionary(key="trigger", category="resource", label_zh="触发", label_en="Trigger"),
        AuditDictionary(key="revoke", category="resource", label_zh="撤销", label_en="Revoke"),
        AuditDictionary(key="toggle", category="resource", label_zh="切换", label_en="Toggle"),
        AuditDictionary(key="ping", category="resource", label_zh="Ping", label_en="Ping"),
        AuditDictionary(key="shutdown", category="resource", label_zh="关停", label_en="Shutdown"),
        AuditDictionary(key="grow", category="resource", label_zh="扩容", label_en="Pool Grow"),
        AuditDictionary(key="shrink", category="resource", label_zh="缩容", label_en="Pool Shrink"),
        AuditDictionary(key="add", category="resource", label_zh="添加", label_en="Add"),
        AuditDictionary(key="cancel", category="resource", label_zh="取消", label_en="Cancel"),
        # Actions
        AuditDictionary(key="create", category="action", label_zh="创建了", label_en="created"),
        AuditDictionary(key="update", category="action", label_zh="修改了", label_en="updated"),
        AuditDictionary(key="delete", category="action", label_zh="删除了", label_en="deleted"),
        AuditDictionary(key="login", category="action", label_zh="登录了", label_en="logged into"),
        AuditDictionary(key="logout", category="action", label_zh="登出了", label_en="logged out of"),
        AuditDictionary(key="refresh", category="action", label_zh="刷新了", label_en="refreshed"),
        AuditDictionary(key="enable", category="action", label_zh="启用了", label_en="enabled"),
        AuditDictionary(key="disable", category="action", label_zh="禁用了", label_en="disabled"),
    ]
    session.add_all(entries)
    await session.commit()


async def clean_db(session: AsyncSession) -> None:
    """清理数据库中的初始化数据，方便重新初始化。"""
    await session.exec(delete(Menu))
    await session.exec(delete(Role))
    await session.exec(delete(User))
    await session.exec(delete(Department))
    await session.exec(delete(DataRule))
    await session.exec(delete(AuditDictionary))
    await session.commit()


async def init_db(session: AsyncSession) -> None:
    # 取消注释以下行可清理数据库后重新初始化
    await clean_db(session)
    await create_departments(session)
    data_rules = await create_data_rules(session)
    await session.commit()
    await create_roles_and_users(session, data_rules)
    await create_menus(session)
    await create_audit_dictionary(session)


async def flush_redis_cache() -> None:
    """清除 Redis 中的业务缓存，避免 initdb 后读到旧数据。"""
    RedisManager.connect()
    redis = RedisManager.client()
    await invalidate_menu_cache(redis)
    await RedisManager.disconnect()


async def main() -> None:
    async with AsyncSessionLocal() as session:
        await init_db(session)
    await flush_redis_cache()


if __name__ == "__main__":
    asyncio.run(main())
