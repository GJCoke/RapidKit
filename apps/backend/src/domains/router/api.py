"""
Router API info.

Author  : Coke
Date    : 2025-04-23
"""

from fastapi import APIRouter, Depends

from src.common.schemas.response import Response
from src.domains.role.deps import verify_user_permission
from src.domains.router.deps import RouterCrudDep
from src.domains.router.schemas import FastAPIRouterResponse

router = APIRouter(
    prefix="/router",
    tags=["Router"],
    dependencies=[Depends(verify_user_permission)],
)


@router.get("/backend")
async def get_router(route: RouterCrudDep) -> Response[list[FastAPIRouterResponse]]:
    """
    该端点从数据库检索所有路由并在响应中返回。\f

    Args:
        route: 处理路由 CRUD 操作的依赖。

    Returns:
        路由模型列表，已验证并作为响应返回。
    """

    routes = await route.get_all()
    return Response(data=[FastAPIRouterResponse.model_validate(_route) for _route in routes])
