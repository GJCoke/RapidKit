"""
Init database.

Author  : Coke
Date    : 2025-04-18
"""

import asyncio

from plugin_department.models import Department
from plugin_menu.models import Menu
from plugin_menu.services import invalidate_menu_cache
from plugin_permission.field_guard.models import FieldPolicy
from plugin_permission.models import DataPolicy, Role
from plugin_system.audit_dict.models import AuditDictionary
from plugin_user.models import User
from rapidkit_common.enums import Status
from rapidkit_core.database import AsyncSessionLocal, RedisManager
from rapidkit_core.uuid7 import uuid7
from rapidkit_security import hash_password
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
    # 数据策略
    "manage_data-policy:add",
    "manage_data-policy:edit",
    "manage_data-policy:delete",
    # 字段策略
    "manage_field-policy:add",
    "manage_field-policy:edit",
    "manage_field-policy:delete",
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
    # 数据策略 (只读)
    "GET:/api/v1/data-policies",
    "GET:/api/v1/data-policies/all",
    "GET:/api/v1/data-policies/models",
    # 字段策略 (只读)
    "GET:/api/v1/field-policies",
    "GET:/api/v1/field-policies/all",
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
    "manage_data-policy",
    "manage_field-policy",
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


async def create_data_policies(session: AsyncSession) -> list[DataPolicy]:
    """初始化预置数据策略。"""
    result = await session.exec(select(DataPolicy).limit(1))
    if result.first():
        return list((await session.exec(select(DataPolicy))).all())

    policies = [
        DataPolicy(
            id=uuid7(),
            name="仅自己及自己创建",
            description="用户只能看到自己的记录和自己创建的记录",
            target_model="user_users",
            rule={
                "type": "group",
                "logic": "OR",
                "conditions": [
                    {"type": "condition", "field": "id", "operator": "eq", "value": "${user.id}"},
                    {"type": "condition", "field": "created_by", "operator": "eq", "value": "${user.id}"},
                ],
            },
        ),
        DataPolicy(
            id=uuid7(),
            name="本部门数据",
            description="用户只能看到本部门的数据",
            target_model="user_users",
            rule={
                "type": "group",
                "logic": "AND",
                "conditions": [
                    {"type": "condition", "field": "department_id", "operator": "eq", "value": "${user.dept_id}"},
                ],
            },
        ),
        DataPolicy(
            id=uuid7(),
            name="仅本人执行记录",
            description="用户只能看到自己执行的脚本记录",
            target_model="script_executions",
            rule={
                "type": "group",
                "logic": "AND",
                "conditions": [
                    {"type": "condition", "field": "executor_id", "operator": "eq", "value": "${user.id}"},
                ],
            },
        ),
        DataPolicy(
            id=uuid7(),
            name="本部门活动日志",
            description="用户只能看到本部门成员产生的操作日志",
            target_model="system_activity_logs",
            rule={
                "type": "group",
                "logic": "AND",
                "conditions": [
                    {
                        "type": "subquery",
                        "field": "user_id",
                        "operator": "in",
                        "model": "user_users",
                        "target_field": "id",
                        "filter": {
                            "type": "group",
                            "logic": "AND",
                            "conditions": [
                                {
                                    "type": "condition",
                                    "field": "department_id",
                                    "operator": "eq",
                                    "value": "${user.dept_id}",
                                },
                            ],
                        },
                    },
                ],
            },
        ),
        DataPolicy(
            id=uuid7(),
            name="本部门及本人创建的脚本",
            description="用户只能看到本部门成员创建的脚本或自己创建的脚本",
            target_model="script_scripts",
            rule={
                "type": "group",
                "logic": "OR",
                "conditions": [
                    {"type": "condition", "field": "created_by", "operator": "eq", "value": "${user.id}"},
                    {
                        "type": "group",
                        "logic": "AND",
                        "conditions": [
                            {"type": "condition", "field": "created_by", "operator": "is_not_null"},
                            {
                                "type": "subquery",
                                "field": "created_by",
                                "operator": "in",
                                "model": "user_users",
                                "target_field": "id",
                                "filter": {
                                    "type": "group",
                                    "logic": "AND",
                                    "conditions": [
                                        {
                                            "type": "condition",
                                            "field": "department_id",
                                            "operator": "eq",
                                            "value": "${user.dept_id}",
                                        },
                                    ],
                                },
                            },
                        ],
                    },
                ],
            },
        ),
        DataPolicy(
            id=uuid7(),
            name="仅活跃角色",
            description="只能看到启用状态的角色",
            target_model="permission_roles",
            rule={
                "type": "group",
                "logic": "AND",
                "conditions": [
                    {"type": "condition", "field": "status", "operator": "ne", "value": "2"},
                ],
            },
        ),
    ]
    session.add_all(policies)
    await session.flush()
    return policies


async def create_field_policies(session: AsyncSession) -> list[FieldPolicy]:
    """初始化预置字段策略。"""
    result = await session.exec(select(FieldPolicy).limit(1))
    if result.first():
        return list((await session.exec(select(FieldPolicy))).all())

    policies = [
        FieldPolicy(
            id=uuid7(),
            name="用户手机号脱敏",
            description="非管理员查看用户列表时，手机号显示为脱敏格式",
            target_model="user_users",
            fields=["phone"],
            actions=["read"],
            effect="mask",
        ),
        FieldPolicy(
            id=uuid7(),
            name="用户邮箱脱敏",
            description="非管理员查看用户列表时，邮箱显示为脱敏格式",
            target_model="user_users",
            fields=["email"],
            actions=["read"],
            effect="mask",
        ),
        FieldPolicy(
            id=uuid7(),
            name="禁止修改用户角色",
            description="普通用户不能修改用户的角色字段",
            target_model="user_users",
            fields=["roles"],
            actions=["write"],
            effect="deny",
        ),
        FieldPolicy(
            id=uuid7(),
            name="隐藏密码哈希",
            description="响应中移除密码字段",
            target_model="user_users",
            fields=["password"],
            actions=["read"],
            effect="strip",
        ),
        FieldPolicy(
            id=uuid7(),
            name="禁止修改管理员标记",
            description="非管理员不能修改 is_admin 字段",
            target_model="user_users",
            fields=["is_admin"],
            actions=["write"],
            effect="deny",
        ),
    ]
    session.add_all(policies)
    await session.flush()
    return policies


async def create_roles_and_users(
    session: AsyncSession, data_policies: list[DataPolicy], field_policies: list[FieldPolicy]
) -> None:
    """初始化角色和用户。"""
    result = await session.exec(select(User).limit(1))
    if result.first():
        return

    admin_role = Role.model_validate(
        {
            "name": "admin",
            "description": "Administrator",
            "code": "ADMIN",
            "interface_permissions": [],
            "button_permissions": ALL_BUTTON_PERMISSIONS,
        }
    )

    guest_role = Role.model_validate(
        {
            "name": "guest",
            "description": "Guest (data policy demo)",
            "code": "GUEST",
            "router_permissions": GUEST_ROUTER_PERMISSIONS,
            "interface_permissions": GUEST_INTERFACE_PERMISSIONS,
            "button_permissions": [],
            "data_policy_ids": [p.id for p in data_policies[:1]],
            "field_policy_ids": [p.id for p in field_policies[:3]],
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
        AuditDictionary(key="data-policies", category="resource", label_zh="数据策略", label_en="Data Policy"),
        AuditDictionary(key="field-policies", category="resource", label_zh="字段策略", label_en="Field Policy"),
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
    await session.exec(delete(DataPolicy))
    await session.exec(delete(FieldPolicy))
    await session.exec(delete(AuditDictionary))
    await session.commit()


async def init_db(session: AsyncSession) -> None:
    # 取消注释以下行可清理数据库后重新初始化
    await clean_db(session)
    await create_departments(session)
    data_policies = await create_data_policies(session)
    field_policies = await create_field_policies(session)
    await session.commit()
    await create_roles_and_users(session, data_policies, field_policies)
    await create_menus(session)
    await create_audit_dictionary(session)


async def flush_redis_cache() -> None:
    """清除 Redis 中的业务缓存，避免 initdb 后读到旧数据。"""
    RedisManager.connect()
    redis = RedisManager.client()
    await invalidate_menu_cache(redis)
    for pattern in ("auth:permission:*", "auth:policy:*"):
        keys = await redis.keys(pattern)
        if keys:
            await redis.delete(*keys)
    await RedisManager.disconnect()


async def main() -> None:
    async with AsyncSessionLocal() as session:
        await init_db(session)
    await flush_redis_cache()


if __name__ == "__main__":
    asyncio.run(main())
