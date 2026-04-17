"""
Auth plugin — 认证、角色与路由管理。

合并了 auth, role, router 三个域。
通过 PluginManifest.dependency_overrides 注入真实的认证依赖实现。

Author  : Claude
Date    : 2026-04-14
"""

from rapidkit_core.plugin import PluginManifest


def register() -> PluginManifest:
    from fastapi import APIRouter
    from rapidkit_common.auth import _get_current_user_placeholder, _verify_user_permission_placeholder

    from plugin_auth.auth.api import router as auth_router
    from plugin_auth.auth.deps import get_current_user_form_db
    from plugin_auth.auth.models import User
    from plugin_auth.role.api import router as role_router
    from plugin_auth.role.deps import verify_user_permission
    from plugin_auth.role.models import Role
    from plugin_auth.router.api import router as router_api_router
    from plugin_auth.router.models import InterfaceRouter
    from plugin_auth.router.sync import sync_routes_on_startup

    combined = APIRouter()
    combined.include_router(auth_router)
    combined.include_router(role_router)
    combined.include_router(router_api_router)

    return PluginManifest(
        name="auth",
        version="0.1.0",
        router=combined,
        models=[User, Role, InterfaceRouter],
        on_startup=[sync_routes_on_startup],
        dependency_overrides={
            _verify_user_permission_placeholder: verify_user_permission,
            _get_current_user_placeholder: get_current_user_form_db,
        },
    )
