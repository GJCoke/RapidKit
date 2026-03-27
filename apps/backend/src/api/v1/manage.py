"""
菜单管理 API 接口。 TODO: 测试

Author : Coke
Date   : 2025-05-18
"""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlmodel import col

from src.deps.manage import MenuCrudDep
from src.deps.role import verify_user_permission
from src.models import Menu
from src.schemas.manage import MenuBatchRequest, MenuCreate, MenuListResponse, MenuPageQuery, MenuResponse, MenuUpdate
from src.schemas.response import PaginatedResponse, Response
from src.services.manage import filter_menu
from src.utils.enums import MenuType

router = APIRouter(
    prefix="/manage",
    tags=["Menu"],
    dependencies=[Depends(verify_user_permission)],
)


@router.get("/menus")
async def get_menu_list(
    query: Annotated[MenuPageQuery, Query(...)],
    menu_crud: MenuCrudDep,
) -> Response[PaginatedResponse[MenuListResponse]]:
    """获取菜单列表（支持分页）"""
    filters = filter_menu(query.status, query.keyword)
    roles = await menu_crud.get_menu_paginated_tree(*filters, page=query.page, page_size=query.page_size)
    return Response(data=roles)


@router.get("/pages")
async def get_all_pages(menu_crud: MenuCrudDep) -> Response[list[str]]:
    """获取所有页面组件名称"""
    pages = await menu_crud.get_all(col(Menu.menu_type) == MenuType.MENU)
    return Response(data=[item.route_name for item in pages])


@router.post("/add")
async def add_menu(data: MenuCreate, menu_crud: MenuCrudDep):
    """新增菜单。"""
    return await menu_crud.create(data)


@router.put("/update")
async def update_menu(
    data: MenuUpdate,
    menu_id: UUID,
    menu_crud: MenuCrudDep,
) -> Response[MenuResponse]:
    """更新菜单。"""
    menu = await menu_crud.update_by_id(menu_id, data)
    return Response(data=MenuResponse.model_validate(menu))


@router.delete("/delete")
async def delete_menu(menu_id: UUID, menu_crud: MenuCrudDep) -> Response[bool]:
    """删除单个菜单。"""
    await menu_crud.delete(menu_id)
    return Response(data=True)


@router.post("/batchDelete")
async def batch_delete_menus(data: MenuBatchRequest, menu_crud: MenuCrudDep) -> Response[bool]:
    """批量删除菜单。"""
    # 假设 BaseSQLModelCRUD 支持批量删除，或通过循环处理
    for menu_id in data.ids:
        await menu_crud.remove(menu_id)  # type: ignore
    return Response(data=True)
