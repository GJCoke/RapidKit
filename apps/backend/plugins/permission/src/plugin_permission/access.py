"""
访问解析器：``Require(code)`` 的实际实现，按权限码授权并构建请求级权限上下文。

Author : Coke
Date   : 2026-10-17
"""

from fastapi import Request
from fastapi.routing import APIRoute
from rapidkit_common.access import Scope
from rapidkit_common.auth import UserProtocol
from rapidkit_core.log import get_plugin_logger
from rapidkit_core.redis_client import AsyncRedisClient
from rapidkit_framework.exceptions import AppException
from rapidkit_framework.status_codes import StatusCode
from sqlmodel.ext.asyncio.session import AsyncSession

from plugin_permission.audit import log_permission_denied
from plugin_permission.bypass import is_permission_bypass
from plugin_permission.catalog.registry import PermissionCatalog, get_catalog
from plugin_permission.context import PermissionContext
from plugin_permission.role.crud import RoleCRUD
from plugin_permission.role.schemas import PermissionDeniedDetail
from plugin_permission.scope_binding import bind_request_scope, clear_request_scope
from plugin_permission.status_codes import RbacStatusCode
from plugin_permission.user_permissions import get_fresh_permissions
from plugin_permission.utils import build_route_key

logger = get_plugin_logger("Permission")


def _denied_detail(catalog: PermissionCatalog, code: str) -> dict:
    """构建缺失码详情；码未在目录中时以码本身作为名称。"""
    definition = catalog.codes.get(code)
    if definition is None:
        return PermissionDeniedDetail(code=code, label=code, resource="", resource_label="").model_dump(by_alias=True)
    resource = catalog.resource_of(code)
    return PermissionDeniedDetail(
        code=code,
        label=definition.label,
        resource=resource.key,
        resource_label=resource.label,
    ).model_dump(by_alias=True)


async def resolve_access(
    code: str,
    request: Request,
    user: UserProtocol,
    redis: AsyncRedisClient,
    session: AsyncSession,
) -> Scope:
    """
    校验当前用户是否持有可访问本接口的权限码。

    可接受的码来自接口的代码声明，用户码已按代码依赖展开。
    启动后动态注册、未进入目录的接口只接受声明码。

    Args:
        code: 接口声明的权限码。
        request: 当前请求。
        user: 当前用户。
        redis: AsyncRedisClient 实例。
        session: 数据库会话。

    Returns:
        本次授权结果；数据范围与字段规则已绑定到请求会话与序列化上下文。

    Raises:
        AppException: 权限不足（34001，``data`` 为缺失码详情）。
    """
    if is_permission_bypass(user):
        clear_request_scope()
        return Scope(user=user, code=code)

    route = request.scope.get("route")
    if not isinstance(route, APIRoute):
        raise AppException(StatusCode.INTERNAL_SERVER_ERROR)
    route_key = build_route_key(route.methods, route.path)

    cached, current_versions = await get_fresh_permissions(user.id, user.roles, redis, RoleCRUD(session))
    catalog = get_catalog()
    if not catalog.allows(code, route_key, cached.codes):
        logger.warning(
            "Permission denied: user_id={user_id} code={code} route={route_key}",
            user_id=user.id,
            code=code,
            route_key=route_key,
        )
        log_permission_denied(
            user_id=user.id,
            code=code,
            route_key=route_key,
            role_versions=cached.role_versions,
            catalog_version=cached.catalog_version,
        )
        raise AppException(RbacStatusCode.ROLE_PERMISSION_DENIED, data=_denied_detail(catalog, code))

    request.state.permission_ctx = PermissionContext(
        user=user,
        cached_role_versions=cached.role_versions,
        current_role_versions=current_versions,
        codes=cached.codes,
    )
    await bind_request_scope(code=code, user=user, request=request, session=session, catalog=catalog, cached=cached)
    return Scope(user=user, code=code)
