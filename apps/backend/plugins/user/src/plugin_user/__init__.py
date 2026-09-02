"""
User plugin — 用户管理。

Author  : Coke
Date    : 2026-05-11
"""

from rapidkit_common.events import (
    DepartmentDeletedEvent,
    RoleDeletedEvent,
    RolePermissionsChangedEvent,
    UserActivityObservedEvent,
)
from rapidkit_common.protocols.operations import UserOperationsProvider
from rapidkit_common.protocols.user import UserQueryService, UserResolver
from rapidkit_framework.plugin import DashboardModuleDef, PluginManifest
from rapidkit_framework.services import ServiceRegistry


async def _on_role_permissions_changed(event: RolePermissionsChangedEvent) -> None:
    """事件总线 role.permissions_changed 监听器。"""
    from rapidkit_core.database import AsyncSessionLocal, RedisManager

    from plugin_user.services import invalidate_users_by_role_code

    redis = RedisManager.client()
    async with AsyncSessionLocal() as session:
        await invalidate_users_by_role_code(redis, event.role_code, session)


async def _on_department_deleted(event: DepartmentDeletedEvent) -> None:
    """部门删除 → 清空关联用户的 department_id。"""
    from rapidkit_core.database import AsyncSessionLocal
    from sqlmodel import update

    from plugin_user.models import User

    async with AsyncSessionLocal() as session:
        await session.exec(
            update(User).where(User.department_id == event.department_id).values(department_id=None)  # ty: ignore[invalid-argument-type]
        )
        await session.commit()


async def _on_role_deleted(event: RoleDeletedEvent) -> None:
    """角色删除 → 从所有包含该 role 的用户 roles 数组中移除。"""
    from rapidkit_core.database import AsyncSessionLocal
    from sqlmodel import select

    from plugin_user.models import User

    async with AsyncSessionLocal() as session:
        stmt = select(User).where(User.roles.contains(event.role_code))  # ty: ignore[unresolved-attribute]
        users = (await session.exec(stmt)).all()

        for user in users:
            user.roles = [r for r in user.roles if r != event.role_code]

        await session.commit()


def register() -> PluginManifest:
    from fastapi import APIRouter

    from plugin_user.api import contact_router, router
    from plugin_user.models import User, UserDailyActivity
    from plugin_user.operations import UserOperationsProviderImpl, record_user_activity
    from plugin_user.providers import UserQueryServiceImpl, UserResolverImpl

    def register_services(registry: ServiceRegistry) -> None:
        registry.register(UserResolver, UserResolverImpl())
        registry.register(UserQueryService, UserQueryServiceImpl())
        registry.register(UserOperationsProvider, UserOperationsProviderImpl())

    combined = APIRouter()
    combined.include_router(contact_router)
    combined.include_router(router)

    return PluginManifest(
        name="user",
        version="0.1.0",
        router=combined,
        models=[User, UserDailyActivity],
        dashboard_modules=[
            DashboardModuleDef(
                key="dashboard.trends",
                required_permissions=("GET:/api/v1/users/stats/trend",),
            )
        ],
        provides=[UserResolver, UserQueryService, UserOperationsProvider],
        service_factories={UserResolver: register_services},
        event_listeners=[
            (RolePermissionsChangedEvent, _on_role_permissions_changed),
            (DepartmentDeletedEvent, _on_department_deleted),
            (RoleDeletedEvent, _on_role_deleted),
            (UserActivityObservedEvent, record_user_activity),
        ],
    )
