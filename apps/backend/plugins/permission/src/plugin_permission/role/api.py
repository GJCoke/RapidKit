"""
Author  : Coke
Date    : 2025-04-30
"""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from rapidkit_common.auth import UserDBDep
from rapidkit_common.deps import RedisDep
from rapidkit_common.schemas.response import PaginatedResponse, Response
from rapidkit_common.transaction import after_commit
from rapidkit_core.log import get_plugin_logger
from sqlmodel import col

from plugin_permission.models import Role
from plugin_permission.role.deps import RoleCrudDep, verify_user_permission
from plugin_permission.role.schemas import (
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

logger = get_plugin_logger("Permission")

router = APIRouter(
    prefix="/roles",
    tags=["Role"],
    dependencies=[Depends(verify_user_permission)],
)


@router.get("")
async def get_roles(
    query: Annotated[RolePageQuery, Query(...)],
    role_crud: RoleCrudDep,
) -> Response[PaginatedResponse[RoleResponse]]:
    filter = filter_role(query.status, query.keyword)
    roles = await role_crud.get_paginate(*filter, page=query.page, size=query.page_size, schema=RoleResponse)
    return Response(data=roles)


@router.get("/mine")
async def get_my_roles(role_crud: RoleCrudDep, user: UserDBDep) -> Response[list[RoleResponse]]:
    roles = await role_crud.get_all(col(Role.code).in_(user.roles), schema=RoleResponse)
    return Response(data=roles)


@router.get("/all")
async def get_all_roles(
    query: Annotated[RoleAllQuery, Query(...)],
    role_crud: RoleCrudDep,
) -> Response[list[RoleResponse]]:
    filter = filter_role(query.status, query.keyword)
    roles = await role_crud.get_all(*filter, schema=RoleResponse)
    return Response(data=roles)


@router.get("/{role_id}/permissions")
async def get_role_permissions(
    role_id: UUID,
    role_crud: RoleCrudDep,
) -> Response[RolePermissionsResponse]:
    role = await role_crud.get(role_id, nullable=False)
    return Response(
        data=RolePermissionsResponse(
            router_permissions=role.router_permissions or [],
            button_permissions=role.button_permissions or [],
            interface_permissions=role.interface_permissions or [],
        )
    )


@router.put("/{role_id}/permissions")
async def update_role_permissions(
    role_id: UUID,
    body: RolePermissionsUpdateBody,
    role_crud: RoleCrudDep,
    user: UserDBDep,
    redis: RedisDep,
) -> Response[bool]:

    role = await role_crud.get(role_id, nullable=False)
    role_code = role.code
    await role_crud.update_by_id(
        role_id,
        {
            "router_permissions": body.router_permissions,
            "button_permissions": body.button_permissions,
            "interface_permissions": body.interface_permissions,
        },
    )
    logger.warning(
        "Role permissions updated: role={role_code}, role_id={role_id}, user_id={user_id}",
        role_code=role_code,
        role_id=role_id,
        user_id=user.id,
    )
    after_commit(role_crud.session, publish_role_change, redis, [role_code], operator_id=user.id)
    return Response(data=True)


@router.post("")
async def create_role(body: RoleCreate, role_crud: RoleCrudDep) -> Response[RoleResponse]:
    role = await role_crud.create(body)
    logger.info("Role created: {role_code}", role_code=body.code)
    return Response(data=RoleResponse.model_validate(role))


@router.put("/{role_id}")
async def update_role(
    role_id: UUID,
    body: RoleUpdate,
    role_crud: RoleCrudDep,
    user: UserDBDep,
    redis: RedisDep,
) -> Response[RoleResponse]:
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


@router.delete("")
async def batch_delete_role(
    query: RoleBatchBody,
    role_crud: RoleCrudDep,
    user: UserDBDep,
    redis: RedisDep,
) -> Response[bool]:

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


@router.delete("/{role_id}")
async def delete_role(
    role_id: UUID,
    role_crud: RoleCrudDep,
    user: UserDBDep,
    redis: RedisDep,
) -> Response[bool]:

    role = await role_crud.get(role_id, nullable=False)
    role_code = role.code
    await role_crud.delete(role_id)
    logger.warning("Role deleted: {role_code}, user_id={user_id}", role_code=role_code, user_id=user.id)
    after_commit(role_crud.session, publish_role_change, redis, [role_code], deleted=True, operator_id=user.id)

    return Response(data=True)
