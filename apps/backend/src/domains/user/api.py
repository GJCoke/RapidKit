"""
用户管理 API 接口。

Author : Coke
Date   : 2026-04-02
"""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query

from src.common.deps import RedisDep
from src.common.schemas.response import PaginatedResponse, Response
from src.core.exceptions import AppException
from src.core.status_codes import StatusCode
from src.domains.role.deps import VerifyPermissionDep, verify_user_permission
from src.domains.user.deps import UserManageCrudDep
from src.domains.user.schemas import (
    UserManageBatchBody,
    UserManageCreate,
    UserManagePageQuery,
    UserManageResponse,
    UserManageUpdate,
)
from src.domains.user.services import (
    filter_user,
    invalidate_user_permission_cache,
    invalidate_user_session,
    process_password,
)

router = APIRouter(
    prefix="/users",
    tags=["User"],
    dependencies=[Depends(verify_user_permission)],
)


@router.get("")
async def get_users(
    query: Annotated[UserManagePageQuery, Query(...)],
    user_crud: UserManageCrudDep,
) -> Response[PaginatedResponse[UserManageResponse]]:
    """获取分页的用户列表。\f

    Args:
        query: 包含状态、关键字、页码和每页大小的查询参数。
        user_crud: 提供用户 CRUD 操作的依赖。

    Returns:
        分页的用户数据。
    """
    filters = filter_user(query.status, query.keyword)
    users = await user_crud.get_paginate(*filters, page=query.page, size=query.page_size, serializer=UserManageResponse)
    return Response(data=users)


@router.get("/{user_id}")
async def get_user(
    user_id: UUID,
    user_crud: UserManageCrudDep,
) -> Response[UserManageResponse]:
    """获取单个用户详情。\f

    Args:
        user_id: 用户 ID。
        user_crud: 用户 CRUD 依赖。

    Returns:
        用户详情。
    """
    user = await user_crud.get(user_id, nullable=False)
    return Response(data=UserManageResponse.model_validate(user))


@router.post("")
async def create_user(
    body: UserManageCreate,
    current_user: VerifyPermissionDep,
    user_crud: UserManageCrudDep,
) -> Response[UserManageResponse]:
    """创建新用户。\f

    Args:
        body: 用户创建数据（密码为 RSA 加密）。
        current_user: 当前认证用户（用于权限隔离）。
        user_crud: 用户 CRUD 依赖。

    Returns:
        新创建的用户。
    """
    if not current_user.is_admin:
        body.is_admin = False

    hashed_password = process_password(body.password)
    create_data = body.model_dump()
    create_data["password"] = hashed_password
    user = await user_crud.create(create_data, validate=False)
    return Response(data=UserManageResponse.model_validate(user))


@router.put("/{user_id}")
async def update_user(
    user_id: UUID,
    body: UserManageUpdate,
    current_user: VerifyPermissionDep,
    user_crud: UserManageCrudDep,
    redis: RedisDep,
) -> Response[UserManageResponse]:
    """更新用户信息。\f

    Args:
        user_id: 用户 ID。
        body: 用户更新数据（密码可选，RSA 加密）。
        current_user: 当前认证用户（用于权限隔离）。
        user_crud: 用户 CRUD 依赖。
        redis: Redis 依赖，用于缓存失效。

    Returns:
        更新后的用户。
    """
    update_data = body.model_dump(exclude_unset=True)

    if not current_user.is_admin:
        update_data.pop("is_admin", None)

    # 处理密码字段
    if "password" in update_data:
        if update_data["password"] is not None:
            update_data["password"] = process_password(update_data["password"])
        else:
            del update_data["password"]

    # 角色变更时清除权限缓存
    if "roles" in update_data:
        current_user = await user_crud.get(user_id, nullable=False)
        if set(update_data["roles"]) != set(current_user.roles or []):
            await invalidate_user_permission_cache(redis, user_id)

    user = await user_crud.update_by_id(user_id, update_data)
    return Response(data=UserManageResponse.model_validate(user))


@router.delete("/{user_id}")
async def delete_user(
    user_id: UUID,
    current_user: VerifyPermissionDep,
    user_crud: UserManageCrudDep,
    redis: RedisDep,
) -> Response[bool]:
    """删除单个用户。\f

    Args:
        user_id: 要删除的用户 ID。
        current_user: 当前认证用户（用于禁止自删除）。
        user_crud: 用户 CRUD 依赖。
        redis: Redis 依赖，用于清除缓存。

    Returns:
        删除成功则为 True。
    """
    if user_id == current_user.id:
        raise AppException(StatusCode.BAD_REQUEST)

    target = await user_crud.get(user_id, nullable=False)
    if target.is_admin:
        raise AppException(StatusCode.BAD_REQUEST)

    await user_crud.delete(user_id)
    await invalidate_user_session(redis, user_id)
    return Response(data=True)


@router.delete("")
async def batch_delete_users(
    body: UserManageBatchBody,
    current_user: VerifyPermissionDep,
    user_crud: UserManageCrudDep,
    redis: RedisDep,
) -> Response[bool]:
    """批量删除用户。\f

    Args:
        body: 包含要删除的用户 ID 列表。
        current_user: 当前认证用户（用于禁止自删除）。
        user_crud: 用户 CRUD 依赖。
        redis: Redis 依赖，用于清除缓存。

    Returns:
        删除成功则为 True。
    """
    # 验证：不能删除自己和管理员
    targets = await user_crud.get_by_ids(body.ids)
    for target in targets:
        if target.id == current_user.id:
            raise AppException(StatusCode.BAD_REQUEST)
        if target.is_admin:
            raise AppException(StatusCode.BAD_REQUEST)

    await user_crud.delete_all(body.ids)

    for uid in body.ids:
        await invalidate_user_session(redis, uid)

    return Response(data=True)
