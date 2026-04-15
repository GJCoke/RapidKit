"""
前端动态路由 API 接口。

提供常量路由、用户授权路由和路由存在性检查。

Author : Coke
Date   : 2026-04-02
"""

from fastapi import APIRouter, Query
from sqlmodel import col, select

from rapidkit_common.auth import UserDBDep
from rapidkit_common.deps import SessionDep
from rapidkit_common.schemas.response import Response
from plugin_menu.models import Menu
from plugin_menu.route_schemas import MenuRouteResponse, UserRouteResponse
from plugin_menu.route_services import get_constant_routes, get_user_routes

from plugin_auth.role.deps import RoleCrudDep

router = APIRouter(
    prefix="/route",
    tags=["Route"],
)


@router.get("/constant")
async def get_constant_routes_api(
    session: SessionDep,
) -> Response[list[MenuRouteResponse]]:
    """获取常量路由（公共路由）。"""
    routes = await get_constant_routes(session)
    return Response(data=routes)


@router.get("/user")
async def get_user_routes_api(
    user: UserDBDep,
    session: SessionDep,
    role_crud: RoleCrudDep,
) -> Response[UserRouteResponse]:
    """获取当前用户的授权路由。"""
    result = await get_user_routes(user, session, role_crud)
    return Response(data=result)


@router.get("/exist")
async def is_route_exist(
    user: UserDBDep,
    session: SessionDep,
    route_name: str = Query(alias="routeName"),
) -> Response[bool]:
    """检查路由名是否存在。"""
    statement = select(Menu).where(col(Menu.route_name) == route_name)
    result = await session.exec(statement)
    return Response(data=result.first() is not None)
