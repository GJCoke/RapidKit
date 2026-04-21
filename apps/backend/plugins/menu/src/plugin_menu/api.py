"""
菜单管理 API 接口。

Author : Coke
Date   : 2025-05-18
"""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from rapidkit_common.auth import verify_user_permission
from rapidkit_common.deps import RedisDep, SessionDep
from rapidkit_common.schemas.response import PaginatedResponse, Response
from rapidkit_core.log import get_plugin_logger

from plugin_menu.deps import MenuCrudDep
from plugin_menu.schemas import (
    MenuBatchRequest,
    MenuCreate,
    MenuListResponse,
    MenuPageQuery,
    MenuResponse,
    MenuUpdate,
)
from plugin_menu.services import (
    filter_menu,
    get_cached_menu_tree,
    get_cached_pages,
    invalidate_menu_cache,
)

router = APIRouter(
    prefix="/manage",
    tags=["Menu"],
    dependencies=[Depends(verify_user_permission)],
)

logger = get_plugin_logger("Menu")


@router.get("/menus")
async def get_menu_list(
    query: Annotated[MenuPageQuery, Query(...)],
    menu_crud: MenuCrudDep,
) -> Response[PaginatedResponse[MenuListResponse]]:
    """获取菜单列表（支持分页）"""
    filters = filter_menu(query.status, query.keyword)
    roles = await menu_crud.get_menu_paginated_tree(*filters, page=query.page, page_size=query.page_size)
    return Response(data=roles)


@router.get("/menus/tree")
async def get_menu_tree(
    redis: RedisDep,
    session: SessionDep,
) -> Response[list[MenuListResponse]]:
    """获取完整菜单树（不分页）"""
    tree = await get_cached_menu_tree(redis, session)
    return Response(data=tree)


@router.get("/pages")
async def get_all_pages(redis: RedisDep, session: SessionDep) -> Response[list[str]]:
    """获取所有页面组件名称"""
    pages = await get_cached_pages(redis, session)
    return Response(data=pages)


@router.post("/menus")
async def add_menu(data: MenuCreate, menu_crud: MenuCrudDep, redis: RedisDep) -> Response[MenuResponse]:
    """新增菜单。"""
    menu = await menu_crud.create(data)
    logger.info("Menu created: {menu_name}", menu_name=data.menu_name)
    await invalidate_menu_cache(redis)
    return Response(data=MenuResponse.model_validate(menu))


@router.put("/menus/{menu_id}")
async def update_menu(
    menu_id: UUID,
    data: MenuUpdate,
    menu_crud: MenuCrudDep,
    redis: RedisDep,
) -> Response[MenuResponse]:
    """更新菜单。"""
    menu = await menu_crud.update_by_id(menu_id, data)
    logger.info("Menu updated: {menu_id}", menu_id=menu_id)
    await invalidate_menu_cache(redis)
    return Response(data=MenuResponse.model_validate(menu))


@router.delete("/menus/{menu_id}")
async def delete_menu(menu_id: UUID, menu_crud: MenuCrudDep, redis: RedisDep) -> Response[bool]:
    """删除单个菜单。"""
    await menu_crud.delete(menu_id)
    logger.info("Menu deleted: {menu_id}", menu_id=menu_id)
    await invalidate_menu_cache(redis)
    return Response(data=True)


@router.delete("/menus")
async def batch_delete_menus(data: MenuBatchRequest, menu_crud: MenuCrudDep, redis: RedisDep) -> Response[bool]:
    """批量删除菜单。"""
    await menu_crud.delete_all(data.ids)
    logger.info("Menus batch deleted: {count} items", count=len(data.ids))
    await invalidate_menu_cache(redis)
    return Response(data=True)
