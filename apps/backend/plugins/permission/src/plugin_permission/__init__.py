"""
RBAC authorization plugin with declared data scopes and field rules.

Author : Coke
Date   : 2026-05-11
"""

from rapidkit_common.access import set_access_resolver
from rapidkit_common.protocols.auth import TokenDecoder
from rapidkit_common.protocols.permission import PermissionCacheManager, PermissionCatalogReader
from rapidkit_common.protocols.user import UserResolver
from rapidkit_common.scope_runtime import ScopeContextMiddleware, install_scope_listeners
from rapidkit_framework.plugin import MiddlewareDef, PluginManifest
from rapidkit_framework.services import ServiceRegistry

from plugin_permission.access import resolve_access
from plugin_permission.catalog.startup import build_catalog_on_startup, sync_catalog_version_on_startup
from plugin_permission.permissions import PERMISSION_CODES, PERMISSION_PACKAGES, RESOURCES


def _register_access_resolver() -> None:
    """注册接口访问 resolver 与会话范围监听。"""
    set_access_resolver(resolve_access)
    install_scope_listeners()


def register() -> PluginManifest:
    from fastapi import APIRouter

    from plugin_permission.audit import configure_audit
    from plugin_permission.catalog.api import router as catalog_router
    from plugin_permission.dashboard.api import router as dashboard_router
    from plugin_permission.models import Role
    from plugin_permission.package.api import router as package_router
    from plugin_permission.providers import PermissionCacheManagerImpl, PermissionCatalogReaderImpl
    from plugin_permission.role.api import router as role_router

    combined = APIRouter()
    combined.include_router(role_router)
    combined.include_router(dashboard_router)
    combined.include_router(catalog_router)
    combined.include_router(package_router)

    def register_services(registry: ServiceRegistry) -> None:
        registry.register(PermissionCacheManager, PermissionCacheManagerImpl())
        registry.register(PermissionCatalogReader, PermissionCatalogReaderImpl())

    _register_access_resolver()

    return PluginManifest(
        name="permission",
        version="0.1.0",
        resources=RESOURCES,
        permission_codes=PERMISSION_CODES,
        permission_packages=PERMISSION_PACKAGES,
        router=combined,
        audit_actions=configure_audit(combined),
        models=[Role],
        dependencies=["auth"],
        middlewares=[MiddlewareDef(cls=ScopeContextMiddleware)],
        requires=[UserResolver, TokenDecoder],
        provides=[PermissionCacheManager, PermissionCatalogReader],
        service_factories={PermissionCacheManager: register_services},
        on_startup=[
            build_catalog_on_startup,
            sync_catalog_version_on_startup,
        ],
    )
