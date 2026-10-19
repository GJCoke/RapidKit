"""当前登录用户的首页模块权限查询接口。"""

from fastapi import APIRouter, Request
from rapidkit_common.access import Authenticated
from rapidkit_common.auth import UserDBDep
from rapidkit_common.deps import RedisDep
from rapidkit_common.schemas.response import Response

from plugin_permission.dashboard.schemas import DashboardCapabilitiesResponse
from plugin_permission.dashboard.services import collect_dashboard_modules, resolve_capabilities
from plugin_permission.role.deps import RoleCrudDep, get_user_permission_cache

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


@router.get("/capabilities", summary="当前用户首页模块权限", dependencies=[Authenticated])
async def get_dashboard_capabilities(
    request: Request,
    user: UserDBDep,
    redis: RedisDep,
    role: RoleCrudDep,
) -> Response[DashboardCapabilitiesResponse]:
    """从已加载插件的模块权限注册表中获取当前用户获授权的模块标识。"""
    cached = await get_user_permission_cache(user, redis, role)
    definitions = collect_dashboard_modules(request.app.state.plugins)
    capabilities = resolve_capabilities(
        definitions,
        set(cached.codes),
        is_admin=user.is_admin,
        role_versions=cached.role_versions,
    )
    return Response(data=capabilities)
