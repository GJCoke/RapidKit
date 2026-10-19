"""
后端接口路由信息查询。

Author  : Coke
Date    : 2025-04-23
"""

from fastapi import APIRouter
from rapidkit_common.access import Require
from rapidkit_common.schemas.response import Response

from plugin_permission.router.deps import RouterCrudDep
from plugin_permission.router.schemas import FastAPIRouterResponse

router = APIRouter(
    prefix="/router",
    tags=["Router"],
)


@router.get("/backend", dependencies=[Require("api-route:read")])
async def get_router(route: RouterCrudDep) -> Response[list[FastAPIRouterResponse]]:
    """获取已登记的后端接口路由列表。"""
    routes = await route.get_all()
    return Response(data=[FastAPIRouterResponse.model_validate(_route) for _route in routes])
