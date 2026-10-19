"""
权限扩展管理接口。

Author : Coke
Date   : 2026-10-17
"""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from rapidkit_common.access import Require, Scope
from rapidkit_common.deps import RedisDep, SessionDep
from rapidkit_common.schemas.response import Response
from rapidkit_core.timezone import timezone

from plugin_permission.catalog.registry import get_catalog
from plugin_permission.catalog.runtime import get_route_bindings
from plugin_permission.extension import services
from plugin_permission.extension.crud import PermissionExtensionCRUD
from plugin_permission.extension.denials import list_recent_denials
from plugin_permission.extension.export import render_export
from plugin_permission.extension.schemas import (
    DenialQuery,
    DenialRecord,
    ExtensionCreate,
    ExtensionExport,
    ExtensionListQuery,
    ExtensionResponse,
    ExtensionUpdate,
)

MANAGE = "permission-extension:manage"

router = APIRouter(prefix="/permission-extensions", tags=["permission-extensions"])


async def get_crud(session: SessionDep) -> PermissionExtensionCRUD:
    return PermissionExtensionCRUD(session)


CrudDep = Annotated[PermissionExtensionCRUD, Depends(get_crud)]
ManageScope = Annotated[Scope, Require(MANAGE)]


@router.get("")
async def list_extensions(
    _: ManageScope,
    query: Annotated[ExtensionListQuery, Query(...)],
    crud: CrudDep,
) -> Response[list[ExtensionResponse]]:
    """全部扩展及其当前判定（数量少，不分页）。"""
    items = [services.to_response(row) for row in await crud.list_ordered()]
    if query.kind is not None:
        items = [item for item in items if item.kind == query.kind]
    if query.status is not None:
        items = [item for item in items if item.status == query.status]
    return Response(data=items)


@router.post("")
async def create_extension(
    scope: ManageScope,
    body: ExtensionCreate,
    crud: CrudDep,
    redis: RedisDep,
) -> Response[ExtensionResponse]:
    """创建权限扩展，并刷新权限目录与缓存。"""
    item = await services.create_extension(crud, redis, body, scope.user.id)
    return Response(data=services.to_response(item))


@router.put("/{extension_id}")
async def update_extension(
    scope: ManageScope,
    extension_id: UUID,
    body: ExtensionUpdate,
    crud: CrudDep,
    redis: RedisDep,
) -> Response[ExtensionResponse]:
    """更新权限扩展，并刷新权限目录与缓存。"""
    item = await services.update_extension(crud, redis, extension_id, body, scope.user.id)
    return Response(data=services.to_response(item))


@router.delete("/{extension_id}")
async def delete_extension(
    scope: ManageScope,
    extension_id: UUID,
    crud: CrudDep,
    redis: RedisDep,
) -> Response[None]:
    """删除权限扩展，并刷新权限目录与缓存。"""
    await services.delete_extension(crud, redis, extension_id, scope.user.id)
    return Response(data=None)


@router.get("/export")
async def export_extensions(_: ManageScope) -> Response[ExtensionExport]:
    """生效扩展导出为代码声明文本。"""
    text = render_export(
        get_catalog().extension_states,
        get_route_bindings(),
        generated_at=timezone.f_datetime(timezone.now()),
    )
    return Response(data=ExtensionExport(text=text))


@router.get("/denials")
async def list_denials(
    _: ManageScope,
    query: Annotated[DenialQuery, Query(...)],
    redis: RedisDep,
) -> Response[list[DenialRecord]]:
    """最近被拒的码（按次数降序）。"""
    labels = {code: item.label for code, item in get_catalog().codes.items()}
    return Response(data=await list_recent_denials(redis, days=query.days, labels=labels))
