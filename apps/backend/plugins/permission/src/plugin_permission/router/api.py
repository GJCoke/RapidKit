"""
Router API info.

Author  : Coke
Date    : 2025-04-23
"""

from fastapi import APIRouter, Depends
from rapidkit_common.schemas.response import Response

from plugin_permission.role.deps import verify_user_permission
from plugin_permission.router.deps import RouterCrudDep
from plugin_permission.router.schemas import FastAPIRouterResponse

router = APIRouter(
    prefix="/router",
    tags=["Router"],
    dependencies=[Depends(verify_user_permission)],
)


@router.get("/backend")
async def get_router(route: RouterCrudDep) -> Response[list[FastAPIRouterResponse]]:
    routes = await route.get_all()
    return Response(data=[FastAPIRouterResponse.model_validate(_route) for _route in routes])
