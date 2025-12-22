"""
Author  : Coke
Date    : 2025-04-23
"""

from fastapi import Depends, Request
from typing_extensions import Annotated, Doc

from src.core.exceptions import BadRequestException
from src.core.route import BaseRoute
from src.crud.router import RouterCRUD
from src.deps import SessionDep
from src.models.router import InterfaceRouter


async def get_request_router(request: Request) -> BaseRoute:
    """
    依赖函数：从请求中获取当前路由对象。

    可用于权限校验、路由级日志、动态路由元数据提取等场景。

    Args:
        request: 当前 FastAPI 请求对象。

    Returns:
        BaseRoute: 匹配当前请求路径的路由对象。
    """
    route = request.scope.get("route")
    if not isinstance(route, BaseRoute):
        raise BadRequestException()

    return route


async def get_router_crud(session: SessionDep) -> RouterCRUD:
    """
    提供用于认证逻辑的 RouterCRUD 实例。

    Args:
        session: 注入的数据库会话。

    Returns:
        RouterCRUD: 初始化的 InterfaceRouter 操作 CRUD 实例。
    """
    return RouterCRUD(InterfaceRouter, session=session)


RequestRouterDep = Annotated[
    BaseRoute,
    Depends(get_request_router),
    Doc(
        """
        当前请求的路由对象，通过依赖注入。

        可用于：
        - 自动生成权限码
        - 路由级日志与分析
        - 动态提取路径/方法元数据
        """
    ),
]
RouterCrudDep = Annotated[
    RouterCRUD,
    Depends(get_router_crud),
    Doc(
        """
        依赖项：通过 get_router_crud 注入基于会话的 RouterCRUD 实例。
        用于认证逻辑下的路由增删改查操作。
        """
    ),
]
