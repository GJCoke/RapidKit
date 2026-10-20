"""
菜单管理 API 接口。

Author : Coke
Date   : 2025-05-18
"""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Query
from rapidkit_common.access import Require
from rapidkit_common.deps import RedisDep, SessionDep
from rapidkit_common.events import MenuChangedEvent
from rapidkit_common.schemas.response import PaginatedResponse, Response
from rapidkit_common.transaction import after_commit
from rapidkit_core.log import get_plugin_logger
from rapidkit_framework.events import event_bus

from plugin_menu.deps import MenuCrudDep
from plugin_menu.schemas import (
    ActiveMenuOption,
    ActiveMenuOptionsQuery,
    MenuBatchRequest,
    MenuCreate,
    MenuListResponse,
    MenuPageQuery,
    MenuResponse,
    MenuUpdate,
)
from plugin_menu.services import (
    create_menu as create_menu_service,
)
from plugin_menu.services import (
    delete_menu as delete_menu_service,
)
from plugin_menu.services import (
    delete_menus as delete_menus_service,
)
from plugin_menu.services import filter_menu, get_active_menu_options, get_cached_pages, publish_menu_change
from plugin_menu.services import (
    update_menu as update_menu_service,
)

router = APIRouter(
    prefix="/manage",
    tags=["Menu"],
)

logger = get_plugin_logger("Menu")


@router.get("/menus", dependencies=[Require("menu:read")])
async def get_menu_list(
    query: Annotated[MenuPageQuery, Query(...)],
    menu_crud: MenuCrudDep,
) -> Response[PaginatedResponse[MenuListResponse]]:
    """获取菜单列表（支持分页）"""
    filters = filter_menu(query.status, query.keyword)
    roles = await menu_crud.get_menu_paginated_tree(*filters, page=query.page, page_size=query.page_size)
    return Response(data=roles)


@router.get("/menus/active-menu-options", dependencies=[Require("menu:read")])
async def get_menu_active_menu_options(
    query: Annotated[ActiveMenuOptionsQuery, Query(...)],
    menu_crud: MenuCrudDep,
) -> Response[list[ActiveMenuOption]]:
    """获取当前父菜单链上可绑定的可见页面菜单。"""
    options = await get_active_menu_options(menu_crud, query.parent_id, query.constant)
    return Response(data=options)


@router.get("/pages", dependencies=[Require("menu:read")])
async def get_all_pages(redis: RedisDep, session: SessionDep) -> Response[list[str]]:
    """获取所有页面组件名称"""
    pages = await get_cached_pages(redis, session)
    return Response(data=pages)


@router.post("/menus", dependencies=[Require("menu:create")])
async def add_menu(
    data: MenuCreate,
    menu_crud: MenuCrudDep,
    redis: RedisDep,
    session: SessionDep,
) -> Response[MenuResponse]:
    """新增菜单。"""
    menu = await create_menu_service(menu_crud, data)
    logger.info("Menu created: {menu_name}", menu_name=data.menu_name)
    event_bus.fire_and_forget(MenuChangedEvent(menu_id=str(menu.id), action="created"))
    after_commit(session, publish_menu_change, redis)
    return Response(data=menu)


@router.put("/menus/{menu_id}", dependencies=[Require("menu:update")])
async def update_menu(
    menu_id: UUID,
    data: MenuUpdate,
    menu_crud: MenuCrudDep,
    redis: RedisDep,
    session: SessionDep,
) -> Response[MenuResponse]:
    """更新菜单。"""
    menu = await update_menu_service(menu_crud, menu_id, data)
    logger.info("Menu updated: {menu_id}", menu_id=menu_id)
    event_bus.fire_and_forget(MenuChangedEvent(menu_id=str(menu_id), action="updated"))
    after_commit(session, publish_menu_change, redis)
    return Response(data=menu)


@router.delete("/menus/{menu_id}", dependencies=[Require("menu:delete")])
async def delete_menu(menu_id: UUID, menu_crud: MenuCrudDep, redis: RedisDep, session: SessionDep) -> Response[bool]:
    """删除单个菜单。"""
    await delete_menu_service(menu_crud, menu_id)
    logger.info("Menu deleted: {menu_id}", menu_id=menu_id)
    event_bus.fire_and_forget(MenuChangedEvent(menu_id=str(menu_id), action="deleted"))
    after_commit(session, publish_menu_change, redis)
    return Response(data=True)


@router.delete("/menus", dependencies=[Require("menu:delete")])
async def batch_delete_menus(
    data: MenuBatchRequest, menu_crud: MenuCrudDep, redis: RedisDep, session: SessionDep
) -> Response[bool]:
    """批量删除菜单。"""
    await delete_menus_service(menu_crud, data.ids)
    logger.info("Menus batch deleted: {count} items", count=len(data.ids))
    for mid in data.ids:
        event_bus.fire_and_forget(MenuChangedEvent(menu_id=str(mid), action="deleted"))
    after_commit(session, publish_menu_change, redis)
    return Response(data=True)
