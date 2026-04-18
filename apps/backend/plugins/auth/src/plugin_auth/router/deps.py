"""
Author  : Coke
Date    : 2025-04-23
"""

from fastapi import Depends, Request
from fastapi.routing import APIRoute
from rapidkit_common.deps import SessionDep
from rapidkit_core.exceptions import AppException
from rapidkit_core.status_codes import StatusCode
from typing_extensions import Annotated, Doc

from plugin_auth.router.crud import RouterCRUD


async def get_request_router(request: Request) -> APIRoute:
    route = request.scope.get("route")
    if not isinstance(route, APIRoute):
        raise AppException(StatusCode.INTERNAL_SERVER_ERROR)
    return route


async def get_router_crud(session: SessionDep) -> RouterCRUD:
    return RouterCRUD(session)


RequestRouterDep = Annotated[
    APIRoute,
    Depends(get_request_router),
    Doc("当前请求的路由对象。"),
]
RouterCrudDep = Annotated[
    RouterCRUD,
    Depends(get_router_crud),
    Doc("依赖项：RouterCRUD 实例。"),
]
