"""
Author  : Coke
Date    : 2025-04-30
"""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlmodel import col

from src.core.route import BaseRoute
from src.deps.auth import UserDBDep
from src.deps.role import RoleCrudDep, verify_user_permission
from src.models import Role
from src.schemas.response import PaginatedResponse, Response
from src.schemas.role import RoleAllQuery, RoleBatchBody, RoleCreate, RolePageQuery, RoleResponse, RoleUpdate
from src.services.roles import filter_role

router = APIRouter(
    prefix="/roles",
    tags=["Role"],
    route_class=BaseRoute,
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


@router.delete("")
async def batch_delete_role(query: RoleBatchBody, role_crud: RoleCrudDep) -> Response[bool]:
    """
    根据 ID 列表删除多个角色。\f

    Args:
        query: 包含要删除的角色 ID 列表。
        role_crud: 角色 CRUD 依赖。

    Returns:
        删除成功则为 True。
    """

    await role_crud.delete_all(query.ids)
    return Response(data=True)


@router.delete("/{role_id}")
async def delete_role(role_id: UUID, role_crud: RoleCrudDep) -> Response[bool]:
    """
    根据 ID 删除单个角色。\f

    Args:
        role_id: 要删除的角色 ID。
        role_crud: 角色 CRUD 依赖。

    Returns:
        删除成功则为 True。
    """

    await role_crud.delete(role_id)
    return Response(data=True)
