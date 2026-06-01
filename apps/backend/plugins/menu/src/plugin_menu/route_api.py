"""
前端动态路由 API 接口。

提供常量路由、用户授权路由和路由存在性检查。

Author : Coke
Date   : 2026-04-02
"""

from fastapi import APIRouter, Query
from rapidkit_common.auth import UserDBDep
from rapidkit_common.deps import RedisDep, SessionDep
from rapidkit_common.schemas.response import Response
from sqlmodel import col, select

from plugin_menu.models import Menu
from plugin_menu.route_schemas import MenuRouteResponse, UserRouteResponse
from plugin_menu.services import get_cached_constant_routes, get_cached_user_routes

router = APIRouter(
    prefix="/route",
    tags=["Route"],
)


@router.get("/constant")
async def get_constant_routes_api(
    redis: RedisDep,
    session: SessionDep,
) -> Response[list[MenuRouteResponse]]:
    """获取常量路由（公共路由）。"""
    routes = await get_cached_constant_routes(redis, session)
    return Response(data=routes)


@router.get("/user")
async def get_user_routes_api(
    user: UserDBDep,
    redis: RedisDep,
    session: SessionDep,
) -> Response[UserRouteResponse]:
    """获取当前用户的授权路由。"""
    result = await get_cached_user_routes(user, redis, session)
    return Response(data=result)


@router.get("/exist")
async def is_route_exist(
    session: SessionDep,
    route_name: str = Query(alias="routeName"),
) -> Response[bool]:
    """检查路由名是否存在。"""
    statement = select(Menu).where(col(Menu.route_name) == route_name)
    result = await session.exec(statement)
    return Response(data=result.first() is not None)
