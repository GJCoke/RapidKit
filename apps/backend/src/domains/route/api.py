"""
前端动态路由 API 接口。

提供常量路由、用户授权路由和路由存在性检查。
这些端点仅需认证（UserDBDep），不需要 verify_user_permission，
因为它们是 RBAC 系统本身运行所必需的。

Author : Coke
Date   : 2026-04-02
"""

from fastapi import APIRouter, Query
from sqlmodel import col, select

from src.common.deps import SessionDep
from src.common.schemas.response import Response
from src.domains.auth.deps import UserDBDep
from src.domains.menu.models import Menu
from src.domains.role.deps import RoleCrudDep
from src.domains.route.schemas import MenuRouteResponse, UserRouteResponse
from src.domains.route.services import get_constant_routes, get_user_routes

router = APIRouter(
    prefix="/route",
    tags=["Route"],
)


@router.get("/getConstantRoutes")
async def get_constant_routes_api(
    user: UserDBDep,
    session: SessionDep,
) -> Response[list[MenuRouteResponse]]:
    """
    获取常量路由（公共路由）。\f

    Args:
        user: 当前认证用户（仅用于鉴权）。
        session: 数据库会话。

    Returns:
        常量路由列表。
    """
    routes = await get_constant_routes(session)
    return Response(data=routes)


@router.get("/getUserRoutes")
async def get_user_routes_api(
    user: UserDBDep,
    session: SessionDep,
    role_crud: RoleCrudDep,
) -> Response[UserRouteResponse]:
    """
    获取当前用户的授权路由。\f

    Args:
        user: 当前认证用户。
        session: 数据库会话。
        role_crud: 角色 CRUD 依赖。

    Returns:
        包含路由列表和首页路由名的响应。
    """
    result = await get_user_routes(user, session, role_crud)
    return Response(data=result)


@router.get("/isRouteExist")
async def is_route_exist(
    user: UserDBDep,
    session: SessionDep,
    route_name: str = Query(alias="routeName"),
) -> Response[bool]:
    """
    检查路由名是否存在。\f

    Args:
        user: 当前认证用户（仅用于鉴权）。
        session: 数据库会话。
        route_name: 路由名称。

    Returns:
        路由是否存在。
    """
    statement = select(Menu).where(col(Menu.route_name) == route_name)
    result = await session.exec(statement)
    return Response(data=result.first() is not None)
