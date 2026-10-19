"""
角色管理与权限配置接口。

Author  : Coke
Date    : 2025-04-30
"""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Query
from rapidkit_common.access import Authenticated, Require
from rapidkit_common.auth import UserDBDep
from rapidkit_common.deps import RedisDep
from rapidkit_common.schemas.response import PaginatedResponse, Response
from rapidkit_common.transaction import after_commit
from rapidkit_core.log import get_plugin_logger
from sqlmodel import col

from plugin_permission.catalog.registry import get_catalog
from plugin_permission.models import Role
from plugin_permission.role.deps import RoleCrudDep
from plugin_permission.role.permission_codes import ensure_known_codes, split_permission_codes
from plugin_permission.role.schemas import (
    InvalidScopeResponse,
    RoleAllQuery,
    RoleBatchBody,
    RoleCreate,
    RolePageQuery,
    RolePermissionsResponse,
    RolePermissionsUpdateBody,
    RoleResponse,
    RoleUpdate,
)
from plugin_permission.role.services import filter_role, publish_role_change
from plugin_permission.scope_rules import ensure_valid_scopes, resolve_role_scopes
from plugin_permission.status_codes import RbacStatusCode

logger = get_plugin_logger("Permission")

router = APIRouter(
    prefix="/roles",
    tags=["Role"],
)


@router.get("", dependencies=[Require("role:read")])
async def get_roles(
    query: Annotated[RolePageQuery, Query(...)],
    role_crud: RoleCrudDep,
) -> Response[PaginatedResponse[RoleResponse]]:
    """分页查询角色，支持状态与关键词筛选。"""
    filter = filter_role(query.status, query.keyword)
    roles = await role_crud.get_paginate(*filter, page=query.page, size=query.page_size, schema=RoleResponse)
    return Response(data=roles)


@router.get("/mine", dependencies=[Authenticated])
async def get_my_roles(role_crud: RoleCrudDep, user: UserDBDep) -> Response[list[RoleResponse]]:
    """获取当前登录用户所属的角色。"""
    roles = await role_crud.get_all(col(Role.code).in_(user.roles), schema=RoleResponse)
    return Response(data=roles)


@router.get("/all", dependencies=[Require("role:options")])
async def get_all_roles(
    query: Annotated[RoleAllQuery, Query(...)],
    role_crud: RoleCrudDep,
) -> Response[list[RoleResponse]]:
    """获取符合筛选条件的全部角色，用于下拉选项。"""
    filter = filter_role(query.status, query.keyword)
    roles = await role_crud.get_all(*filter, schema=RoleResponse)
    return Response(data=roles)


@router.get("/{role_id}/permissions", dependencies=[Require("role:read")])
async def get_role_permissions(
    role_id: UUID,
    role_crud: RoleCrudDep,
) -> Response[RolePermissionsResponse]:
    role = await role_crud.get(role_id, nullable=False)
    catalog = get_catalog()
    valid, invalid = split_permission_codes(role.permission_codes or [], catalog)
    resolved = resolve_role_scopes(role.data_scopes or {}, role.field_modes or {}, catalog)
    return Response(
        data=RolePermissionsResponse(
            permission_codes=valid,
            invalid_codes=invalid,
            data_scopes=resolved.data_scopes,
            field_modes=resolved.field_modes,
            invalid_scopes=[
                InvalidScopeResponse(
                    resource=item.resource, group=item.group, stored=item.stored, effective=item.effective
                )
                for item in resolved.invalid
            ],
        )
    )


@router.put("/{role_id}/permissions", dependencies=[Require("role:grant")])
async def update_role_permissions(
    role_id: UUID,
    body: RolePermissionsUpdateBody,
    role_crud: RoleCrudDep,
    user: UserDBDep,
    redis: RedisDep,
) -> Response[bool]:
    """更新角色权限码、数据范围与字段状态，提交后通知权限变更。"""
    role = await role_crud.get(role_id, nullable=False)
    role_code = role.code
    catalog = get_catalog()
    values: dict = {"permission_codes": ensure_known_codes(body.permission_codes, catalog)}
    if body.data_scopes is not None or body.field_modes is not None:
        data_scopes, field_modes = ensure_valid_scopes(
            body.data_scopes or {}, body.field_modes or {}, catalog, error=RbacStatusCode.INVALID_DATA_SCOPE
        )
        if body.data_scopes is not None:
            values["data_scopes"] = data_scopes
        if body.field_modes is not None:
            values["field_modes"] = field_modes
    await role_crud.update_by_id(role_id, values)
    logger.warning(
        "Role permissions updated: role={role_code}, role_id={role_id}, user_id={user_id}",
        role_code=role_code,
        role_id=role_id,
        user_id=user.id,
    )
    after_commit(role_crud.session, publish_role_change, redis, [role_code], operator_id=user.id)
    return Response(data=True)


@router.post("", dependencies=[Require("role:create")])
async def create_role(body: RoleCreate, role_crud: RoleCrudDep) -> Response[RoleResponse]:
    """校验权限码后创建角色。"""
    body.permission_codes = ensure_known_codes(body.permission_codes, get_catalog())
    role = await role_crud.create(body)
    logger.info("Role created: {role_code}", role_code=body.code)
    return Response(data=RoleResponse.model_validate(role))


@router.put("/{role_id}", dependencies=[Require("role:update")])
async def update_role(
    role_id: UUID,
    body: RoleUpdate,
    role_crud: RoleCrudDep,
    user: UserDBDep,
    redis: RedisDep,
) -> Response[RoleResponse]:
    """更新角色信息，提交后通知角色变更。"""
    old_code = (await role_crud.get(role_id, nullable=False)).code
    role = await role_crud.update_by_id(role_id, body)
    logger.warning(
        "Role updated: role={role_code}, role_id={role_id}, user_id={user_id}",
        role_code=role.code,
        role_id=role_id,
        user_id=user.id,
    )
    after_commit(role_crud.session, publish_role_change, redis, [old_code, role.code], operator_id=user.id)
    return Response(data=RoleResponse.model_validate(role))


@router.delete("", dependencies=[Require("role:delete")])
async def batch_delete_role(
    query: RoleBatchBody,
    role_crud: RoleCrudDep,
    user: UserDBDep,
    redis: RedisDep,
) -> Response[bool]:
    """批量删除角色，提交后通知角色删除。"""
    roles = await role_crud.get_by_ids(query.ids)
    role_codes = [r.code for r in roles]

    await role_crud.delete_all(query.ids)
    logger.warning(
        "Roles batch deleted: {role_codes}, user_id={user_id}",
        role_codes=role_codes,
        user_id=user.id,
    )
    after_commit(role_crud.session, publish_role_change, redis, role_codes, deleted=True, operator_id=user.id)

    return Response(data=True)


@router.delete("/{role_id}", dependencies=[Require("role:delete")])
async def delete_role(
    role_id: UUID,
    role_crud: RoleCrudDep,
    user: UserDBDep,
    redis: RedisDep,
) -> Response[bool]:
    """删除指定角色，提交后通知角色删除。"""
    role = await role_crud.get(role_id, nullable=False)
    role_code = role.code
    await role_crud.delete(role_id)
    logger.warning("Role deleted: {role_code}, user_id={user_id}", role_code=role_code, user_id=user.id)
    after_commit(role_crud.session, publish_role_change, redis, [role_code], deleted=True, operator_id=user.id)

    return Response(data=True)
