"""
Author  : Coke
Date    : 2025-04-30
"""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query

from src.common.deps import RedisDep, SessionDep
from src.common.schemas.response import PaginatedResponse, Response
from src.domains.auth.deps import UserDBDep
from src.domains.role.deps import RoleCrudDep, verify_user_permission
from src.domains.role.models import Role
from src.domains.role.schemas import (
    PermissionUpdateBody,
    RoleAllQuery,
    RoleBatchBody,
    RoleCreate,
    RolePageQuery,
    RolePermissionsResponse,
    RoleResponse,
    RoleUpdate,
)
from src.domains.role.services import filter_role

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
    """
    获取分页的角色列表。\f

    Args:
        query: 包含状态、关键字、页码和每页大小的查询参数。
        role_crud: 提供角色 CRUD 操作的依赖。

    Returns:
        分页的角色数据。
    """

    filter = filter_role(query.status, query.keyword)
    roles = await role_crud.get_paginate(*filter, page=query.page, size=query.page_size, serializer=RoleResponse)
    return Response(data=roles)


@router.get("/mine")
async def get_my_roles(role_crud: RoleCrudDep, user: UserDBDep) -> Response[list[RoleResponse]]:
    """
    获取分配给当前用户的角色。\f

    Args:
        role_crud: 角色 CRUD 依赖。
        user: 当前认证的用户依赖。

    Returns:
        角色列表。
    """

    from sqlmodel import col

    roles = await role_crud.get_all(col(Role.code).in_(user.roles), serializer=RoleResponse)
    return Response(data=roles)


@router.get("/all")
async def get_all_roles(
    query: Annotated[RoleAllQuery, Query(...)],
    role_crud: RoleCrudDep,
) -> Response[list[RoleResponse]]:
    """
    获取不带分页的完整角色列表。\f

    Args:
        query: 包含状态和关键字的查询参数。
        role_crud: 角色 CRUD 依赖。

    Returns:
        与过滤条件匹配的角色列表。
    """

    filter = filter_role(query.status, query.keyword)
    roles = await role_crud.get_all(*filter, serializer=RoleResponse)
    return Response(data=roles)


@router.get("/{role_id}/permissions")
async def get_role_permissions(
    role_id: UUID,
    role_crud: RoleCrudDep,
) -> Response[RolePermissionsResponse]:
    """
    获取角色的所有权限。\f

    Args:
        role_id: 角色 ID。
        role_crud: 角色 CRUD 依赖。

    Returns:
        包含路由权限、按钮权限、接口权限的响应。
    """
    role = await role_crud.get(role_id, nullable=False)
    return Response(
        data=RolePermissionsResponse(
            router_permissions=role.router_permissions or [],
            button_permissions=role.button_permissions or [],
            interface_permissions=role.interface_permissions or [],
        )
    )


@router.post("")
async def create_role(body: RoleCreate, role_crud: RoleCrudDep) -> Response[RoleResponse]:
    """
    创建一个新角色。\f

    Args:
        body: 角色创建数据。
        role_crud: 角色 CRUD 依赖。

    Returns:
        新创建的角色。
    """

    role = await role_crud.create(body)
    return Response(data=RoleResponse.model_validate(role))


@router.put("/{role_id}")
async def update_role(role_id: UUID, body: RoleUpdate, role_crud: RoleCrudDep) -> Response[RoleResponse]:
    """
    根据 ID 更新角色。\f

    Args:
        role_id: 要更新的角色 ID。
        body: 新的角色数据。
        role_crud: 角色 CRUD 依赖。

    Returns:
        更新后的角色。
    """

    role = await role_crud.update_by_id(role_id, body)
    return Response(data=RoleResponse.model_validate(role))


@router.put("/{role_id}/permissions/router")
async def update_router_permissions(
    role_id: UUID,
    body: PermissionUpdateBody,
    role_crud: RoleCrudDep,
) -> Response[bool]:
    """
    更新角色的路由权限。\f

    Args:
        role_id: 角色 ID。
        body: 权限列表。
        role_crud: 角色 CRUD 依赖。

    Returns:
        更新成功则为 True。
    """
    await role_crud.update_by_id(role_id, {"router_permissions": body.permissions})
    return Response(data=True)


@router.put("/{role_id}/permissions/button")
async def update_button_permissions(
    role_id: UUID,
    body: PermissionUpdateBody,
    role_crud: RoleCrudDep,
) -> Response[bool]:
    """
    更新角色的按钮权限。\f

    Args:
        role_id: 角色 ID。
        body: 权限列表。
        role_crud: 角色 CRUD 依赖。

    Returns:
        更新成功则为 True。
    """
    await role_crud.update_by_id(role_id, {"button_permissions": body.permissions})
    return Response(data=True)


@router.put("/{role_id}/permissions/interface")
async def update_interface_permissions(
    role_id: UUID,
    body: PermissionUpdateBody,
    role_crud: RoleCrudDep,
    redis: RedisDep,
    session: SessionDep,
) -> Response[bool]:
    """
    更新角色的接口权限（触发缓存失效）。\f

    Args:
        role_id: 角色 ID。
        body: 权限列表。
        role_crud: 角色 CRUD 依赖。
        redis: Redis 依赖，用于缓存失效。
        session: 数据库会话，用于查找受影响的用户。

    Returns:
        更新成功则为 True。
    """
    from src.domains.user.services import invalidate_users_by_role_code

    role = await role_crud.get(role_id, nullable=False)
    await role_crud.update_by_id(role_id, {"interface_permissions": body.permissions})
    await invalidate_users_by_role_code(redis, role.code, session)
    return Response(data=True)


@router.delete("")
async def batch_delete_role(
    query: RoleBatchBody,
    role_crud: RoleCrudDep,
    redis: RedisDep,
    session: SessionDep,
) -> Response[bool]:
    """
    根据 ID 列表删除多个角色。\f

    Args:
        query: 包含要删除的角色 ID 列表。
        role_crud: 角色 CRUD 依赖。
        redis: Redis 依赖，用于缓存失效。
        session: 数据库会话。

    Returns:
        删除成功则为 True。
    """
    from src.domains.user.services import invalidate_users_by_role_code

    # 先获取角色编码，用于缓存失效
    roles = await role_crud.get_by_ids(query.ids)
    role_codes = [r.code for r in roles]

    await role_crud.delete_all(query.ids)

    for code in role_codes:
        await invalidate_users_by_role_code(redis, code, session)

    return Response(data=True)


@router.delete("/{role_id}")
async def delete_role(
    role_id: UUID,
    role_crud: RoleCrudDep,
    redis: RedisDep,
    session: SessionDep,
) -> Response[bool]:
    """
    根据 ID 删除单个角色。\f

    Args:
        role_id: 要删除的角色 ID。
        role_crud: 角色 CRUD 依赖。
        redis: Redis 依赖，用于缓存失效。
        session: 数据库会话。

    Returns:
        删除成功则为 True。
    """
    from src.domains.user.services import invalidate_users_by_role_code

    role = await role_crud.get(role_id, nullable=False)
    await role_crud.delete(role_id)
    await invalidate_users_by_role_code(redis, role.code, session)

    return Response(data=True)
