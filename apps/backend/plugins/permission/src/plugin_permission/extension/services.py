"""
权限扩展服务：保存时校验、增删改编排、提交后发布目录变更。

Author : Coke
Date   : 2026-10-17
"""

from uuid import UUID

from rapidkit_common.transaction import after_commit
from rapidkit_core.database import AsyncSessionLocal
from rapidkit_core.log import get_plugin_logger
from rapidkit_core.realtime import emit_permission_changed
from rapidkit_core.redis_client import AsyncRedisClient
from rapidkit_framework.exceptions import AppException
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from plugin_permission.catalog.extensions import CatalogExtension, ExtensionState, plan_extensions
from plugin_permission.catalog.registry import get_catalog
from plugin_permission.catalog.runtime import (
    bump_catalog_version,
    get_baseline_catalog,
    get_route_bindings,
    rebuild_catalog,
    to_catalog_extension,
)
from plugin_permission.extension.crud import PermissionExtensionCRUD
from plugin_permission.extension.models import PermissionExtension
from plugin_permission.extension.schemas import ExtensionCreate, ExtensionResponse, ExtensionUpdate
from plugin_permission.models import InterfaceRouter
from plugin_permission.status_codes import RbacStatusCode
from plugin_permission.utils import build_route_key

logger = get_plugin_logger("Permission")

_INVALID_REASON_CODES = {
    "unknown_code": RbacStatusCode.EXTENSION_UNKNOWN_CODE,
    "unknown_route": RbacStatusCode.EXTENSION_UNKNOWN_ROUTE,
    "cycle": RbacStatusCode.EXTENSION_DEPENDS_CYCLE,
}


async def route_registered(session: AsyncSession, route_key: str) -> bool:
    """接口是否存在于已同步的路由表 permission_routers。"""
    routes = (await session.exec(select(InterfaceRouter))).all()
    return any(build_route_key(route.methods or [], route.path) == route_key for route in routes)


def _ensure_acceptable(candidate: CatalogExtension, existing: list[CatalogExtension]) -> None:
    """把候选扩展追加到现有扩展末尾判定，非 active 时抛对应业务异常。"""
    plan = plan_extensions(get_baseline_catalog(), get_route_bindings(), [*existing, candidate])
    state = plan.states[-1]
    if state.status == "active":
        return
    if state.status == "cleanable":
        raise AppException(
            RbacStatusCode.EXTENSION_DUPLICATES_BASELINE
            if state.reason == "covered_by_baseline"
            else RbacStatusCode.EXTENSION_ALREADY_EXISTS
        )
    raise AppException(_INVALID_REASON_CODES.get(state.reason or "", RbacStatusCode.EXTENSION_INVALID_CUSTOM_CODE))


async def publish_catalog_change(redis: AsyncRedisClient) -> None:
    """提交后：重建本进程目录 → 递增目录版本 → 推送瘦信号（scope=menu 使全部客户端刷新）。"""
    async with AsyncSessionLocal() as session:
        await rebuild_catalog(session)
    version = await bump_catalog_version(redis)
    logger.warning("Permission catalog version bumped by extension change: version={version}", version=version)
    await emit_permission_changed("menu")


async def create_extension(
    crud: PermissionExtensionCRUD,
    redis: AsyncRedisClient,
    body: ExtensionCreate,
    operator_id: UUID,
) -> PermissionExtension:
    """校验并创建扩展，提交后发布目录变更。"""
    candidate = CatalogExtension(
        kind=body.kind,
        code=body.code,
        route_key=body.route_key,
        depends_on=body.depends_on,
        resource=body.resource,
        label=body.label,
        abac_action=body.abac_action,
    )
    if candidate.kind == "route_binding" and not await route_registered(crud.session, candidate.route_key or ""):
        raise AppException(RbacStatusCode.EXTENSION_UNKNOWN_ROUTE)
    existing = [to_catalog_extension(row) for row in await crud.list_ordered()]
    _ensure_acceptable(candidate, existing)

    item = await crud.create({**body.model_dump(), "created_by": operator_id})
    logger.warning(
        "Permission extension created: id={id} kind={kind} code={code} user_id={user_id}",
        id=item.id,
        kind=body.kind,
        code=body.code,
        user_id=operator_id,
    )
    after_commit(crud.session, publish_catalog_change, redis)
    return item


async def update_extension(
    crud: PermissionExtensionCRUD,
    redis: AsyncRedisClient,
    extension_id: UUID,
    body: ExtensionUpdate,
    operator_id: UUID,
) -> PermissionExtension:
    """修改备注；自定义码还可修改名称与动作。"""
    current = await crud.get(extension_id)
    if current is None:
        raise AppException(RbacStatusCode.EXTENSION_NOT_FOUND)
    data = body.model_dump(exclude_unset=True)
    if current.kind != "custom_code":
        data = {key: value for key, value in data.items() if key == "note"}
    item = await crud.update_by_id(extension_id, data)
    logger.warning(
        "Permission extension updated: id={id} fields={fields} user_id={user_id}",
        id=extension_id,
        fields=sorted(data),
        user_id=operator_id,
    )
    after_commit(crud.session, publish_catalog_change, redis)
    return item


async def delete_extension(
    crud: PermissionExtensionCRUD,
    redis: AsyncRedisClient,
    extension_id: UUID,
    operator_id: UUID,
) -> None:
    """删除扩展；被其他扩展引用的自定义码拒绝删除。"""
    current = await crud.get(extension_id)
    if current is None:
        raise AppException(RbacStatusCode.EXTENSION_NOT_FOUND)
    if current.kind == "custom_code":
        rows = await crud.list_ordered()
        referenced = any(
            row.id != current.id and (row.code == current.code or row.depends_on == current.code) for row in rows
        )
        if referenced:
            raise AppException(RbacStatusCode.EXTENSION_IN_USE)
    await crud.delete(extension_id)
    logger.warning(
        "Permission extension deleted: id={id} kind={kind} code={code} user_id={user_id}",
        id=extension_id,
        kind=current.kind,
        code=current.code,
        user_id=operator_id,
    )
    after_commit(crud.session, publish_catalog_change, redis)


def _state_index() -> dict[UUID, ExtensionState]:
    return {state.extension.id: state for state in get_catalog().extension_states if state.extension.id is not None}


def to_response(row: PermissionExtension) -> ExtensionResponse:
    """数据库行 + 当前目录判定 → 响应；目录尚未包含该行（刚创建、未刷新）时按 active 展示。"""
    state = _state_index().get(row.id)
    return ExtensionResponse.model_validate(
        {
            **row.model_dump(),
            "status": state.status if state else "active",
            "reason": state.reason if state else None,
        }
    )
