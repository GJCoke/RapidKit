"""
User plugin — 用户管理。

Author  : Coke
Date    : 2026-05-11
"""

from rapidkit_common.events import (
    DepartmentDeletedEvent,
    RoleDeletedEvent,
    UserActivityObservedEvent,
)
from rapidkit_common.protocols.operations import UserOperationsProvider
from rapidkit_common.protocols.user import UserQueryService, UserResolver
from rapidkit_framework.plugin import DashboardModuleDef, PluginManifest
from rapidkit_framework.services import ServiceRegistry

from plugin_user.permissions import PERMISSION_CODES, PERMISSION_PACKAGES, RESOURCES


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
    """角色删除 → 从所有包含该 role 的用户 roles 数组中移除，并清除这些用户的信息缓存。"""
    from rapidkit_core.database import AsyncSessionLocal, RedisManager
    from sqlmodel import select

    from plugin_user.models import User
    from plugin_user.services import invalidate_user_cache

    async with AsyncSessionLocal() as session:
        stmt = select(User).where(User.roles.contains(event.role_code))  # ty: ignore[unresolved-attribute]
        users = (await session.exec(stmt)).all()

        for user in users:
            user.roles = [r for r in user.roles if r != event.role_code]
        user_ids = [user.id for user in users]

        await session.commit()

    redis = RedisManager.client()
    for user_id in user_ids:
        await invalidate_user_cache(redis, user_id)


def register() -> PluginManifest:
    from fastapi import APIRouter

    from plugin_user.api import contact_router, router
    from plugin_user.audit import configure_audit
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
        resources=RESOURCES,
        permission_codes=PERMISSION_CODES,
        permission_packages=PERMISSION_PACKAGES,
        router=combined,
        audit_actions=configure_audit(combined),
        models=[User, UserDailyActivity],
        dashboard_modules=[
            DashboardModuleDef(
                key="dashboard.trends",
                required_permissions=("user:stats",),
            )
        ],
        provides=[UserResolver, UserQueryService, UserOperationsProvider],
        service_factories={UserResolver: register_services},
        event_listeners=[
            (DepartmentDeletedEvent, _on_department_deleted),
            (RoleDeletedEvent, _on_role_deleted),
            (UserActivityObservedEvent, record_user_activity),
        ],
    )
