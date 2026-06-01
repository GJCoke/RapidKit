"""
RBAC/ABAC authorization plugin.

Author : Coke
Date   : 2026-05-11
"""

from rapidkit_common.protocols.auth import TokenDecoder
from rapidkit_common.protocols.permission import PermissionCacheManager
from rapidkit_common.protocols.user import UserResolver
from rapidkit_framework.plugin import PluginManifest
from rapidkit_framework.services import ServiceRegistry

from plugin_permission.field_guard.models import FieldPolicy


def _register_field_permission_resolver() -> None:
    """注册字段权限解析器到 rapidkit_common。"""
    from rapidkit_common.field_permission import set_field_permission_resolver

    from plugin_permission.field_guard.resolver import resolve_field_permissions

    set_field_permission_resolver(resolve_field_permissions)


def register() -> PluginManifest:
    from fastapi import APIRouter

    from plugin_permission.data_policy.api import router as data_policy_router
    from plugin_permission.field_guard.api import router as field_guard_router
    from plugin_permission.models import DataPolicy, InterfaceRouter, Role
    from plugin_permission.providers import PermissionCacheManagerImpl
    from plugin_permission.role.api import router as role_router
    from plugin_permission.router.api import router as router_api_router
    from plugin_permission.router.sync import sync_routes_on_startup

    combined = APIRouter()
    combined.include_router(role_router)
    combined.include_router(router_api_router)
    combined.include_router(data_policy_router)
    combined.include_router(field_guard_router)

    def register_services(registry: ServiceRegistry) -> None:
        registry.register(PermissionCacheManager, PermissionCacheManagerImpl())

    from rapidkit_common.auth import _verify_user_permission_placeholder

    from plugin_permission.role.deps import verify_user_permission

    _register_field_permission_resolver()

    return PluginManifest(
        name="permission",
        version="0.1.0",
        router=combined,
        models=[Role, InterfaceRouter, DataPolicy, FieldPolicy],
        dependencies=["auth"],
        requires=[UserResolver, TokenDecoder],
        provides=[PermissionCacheManager],
        service_factories={PermissionCacheManager: register_services},
        on_startup=[sync_routes_on_startup],
        dependency_overrides={
            _verify_user_permission_placeholder: verify_user_permission,
        },
    )
