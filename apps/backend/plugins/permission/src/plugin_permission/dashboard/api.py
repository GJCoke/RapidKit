"""Authenticated dashboard capability API."""

from fastapi import APIRouter, Request
from rapidkit_common.auth import UserDBDep
from rapidkit_common.deps import RedisDep
from rapidkit_common.schemas.response import Response

from plugin_permission.dashboard.schemas import DashboardCapabilitiesResponse
from plugin_permission.dashboard.services import collect_dashboard_modules, resolve_capabilities
from plugin_permission.role.deps import RoleCrudDep, get_user_permission_cache

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


@router.get("/capabilities", summary="当前用户首页模块权限")
async def get_dashboard_capabilities(
    request: Request,
    user: UserDBDep,
    redis: RedisDep,
    role: RoleCrudDep,
) -> Response[DashboardCapabilitiesResponse]:
    """Return authorized keys from the loaded plugin capability registry."""
    cached = await get_user_permission_cache(user, redis, role)
    definitions = collect_dashboard_modules(request.app.state.plugins)
    capabilities = resolve_capabilities(
        definitions,
        set(cached.permissions),
        is_admin=user.is_admin,
        role_versions=cached.role_versions,
    )
    return Response(data=capabilities)
