"""
用户管理 API 接口。

Author : Coke
Date   : 2026-04-02
"""

from datetime import date
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from plugin_auth.auth.deps import UserDBDep
from plugin_auth.auth.models import User
from plugin_auth.auth.services import decrypt_password
from plugin_auth.data_rule.deps import DataPermissionFilter
from plugin_auth.role.deps import VerifyPermissionDep
from plugin_system.schemas import UserActivityTrend, UserStatsSummary
from rapidkit_common.auth import verify_user_permission
from rapidkit_common.deps import RedisDep
from rapidkit_common.schemas.response import PaginatedResponse, Response
from rapidkit_core.exceptions import AppException
from rapidkit_core.log import get_plugin_logger
from rapidkit_core.security import check_password
from rapidkit_core.status_codes import StatusCode
from sqlalchemy import ColumnElement

from plugin_user.deps import UserManageCrudDep
from plugin_user.schemas import (
    ChangePasswordBody,
    UserManageBatchBody,
    UserManageCreate,
    UserManageOptionResponse,
    UserManagePageQuery,
    UserManageResponse,
    UserManageUpdate,
)
from plugin_user.services import (
    filter_user,
    invalidate_user_cache,
    invalidate_user_permission_cache,
    invalidate_user_session,
    process_password,
)

logger = get_plugin_logger("User")


router = APIRouter(
    prefix="/users",
    tags=["User"],
    dependencies=[Depends(verify_user_permission)],
)


@router.get("/stats/summary", summary="用户统计摘要")
async def get_user_stats_summary(
    user_crud: UserManageCrudDep,
    redis: RedisDep,
) -> Response[UserStatsSummary]:
    """获取用户总数、今日新增、昨日新增和在线用户数。"""
    summary = await user_crud.get_user_count_summary()
    online_count = await redis.scard("online_users") or 0  # ty: ignore[invalid-await]
    return Response(
        data=UserStatsSummary(
            total=summary["total"],
            today_new=summary["today_new"],
            yesterday_new=summary["yesterday_new"],
            online_count=online_count,
        )
    )


@router.get("/stats/trend", summary="用户活跃趋势")
async def get_user_stats_trend(
    user_crud: UserManageCrudDep,
    start: date = Query(..., description="开始日期"),
    end: date = Query(..., description="结束日期"),
    granularity: str = Query("day", description="粒度: hour | day"),
) -> Response[list[UserActivityTrend]]:
    """获取用户注册趋势数据。"""
    data = await user_crud.get_user_activity_trend(start, end, granularity)
    return Response(data=[UserActivityTrend(**item) for item in data])


@router.get("/all", summary="全部用户选项")
async def get_all_users(user_crud: UserManageCrudDep) -> Response[list[UserManageOptionResponse]]:
    """获取全部用户（精简字段，用于下拉选项）。"""
    users = await user_crud.get_all(schema=UserManageOptionResponse)
    return Response(data=users)


@router.get("")
async def get_users(
    query: Annotated[UserManagePageQuery, Query(...)],
    user_crud: UserManageCrudDep,
    data_filter: Annotated[ColumnElement[bool], Depends(DataPermissionFilter(User))],
) -> Response[PaginatedResponse[UserManageResponse]]:
    """获取分页的用户列表。"""
    filters = filter_user(query.status, query.keyword)
    users = await user_crud.get_paginate(
        *filters, data_filter, page=query.page, size=query.page_size, schema=UserManageResponse
    )
    return Response(data=users)


@router.get("/{user_id}")
async def get_user(
    user_id: UUID,
    user_crud: UserManageCrudDep,
) -> Response[UserManageResponse]:
    """获取单个用户详情。"""
    user = await user_crud.get(user_id, nullable=False)
    return Response(data=UserManageResponse.model_validate(user))


@router.put("/{user_id}/password", summary="修改用户密码")
async def change_password(
    user_id: UUID,
    body: ChangePasswordBody,
    current_user: UserDBDep,
    user_crud: UserManageCrudDep,
    redis: RedisDep,
) -> Response[bool]:
    """修改用户密码。仅本人或超管可操作。"""
    is_self = current_user.id == user_id

    if not is_self and not current_user.is_admin:
        raise AppException(StatusCode.INSUFFICIENT_PERMISSIONS)

    if is_self:
        if not body.old_password:
            raise AppException(StatusCode.BAD_REQUEST)
        decrypted_old = decrypt_password(body.old_password)
        target_user = await user_crud.get(user_id, nullable=False)
        if not check_password(decrypted_old, target_user.password):
            raise AppException(StatusCode.AUTHENTICATION_FAILED)

    new_hashed = process_password(body.new_password)
    await user_crud.update_by_id(user_id, {"password": new_hashed})

    await invalidate_user_cache(redis, user_id)
    await invalidate_user_session(redis, user_id)
    logger.warning(
        "Password changed for user {user_id} by {operator}",
        user_id=user_id,
        operator=current_user.id,
    )
    return Response(data=True)


@router.post("")
async def create_user(
    body: UserManageCreate,
    current_user: VerifyPermissionDep,
    user_crud: UserManageCrudDep,
) -> Response[UserManageResponse]:
    """创建新用户。"""
    if not current_user.is_admin:
        body.is_admin = False

    hashed_password = process_password(body.password)
    create_data = body.model_dump()
    create_data["password"] = hashed_password
    user = await user_crud.create(create_data)
    logger.info("User created: {user_id} by {operator}", user_id=user.id, operator=current_user.id)
    return Response(data=UserManageResponse.model_validate(user))


@router.put("/{user_id}")
async def update_user(
    user_id: UUID,
    body: UserManageUpdate,
    current_user: VerifyPermissionDep,
    user_crud: UserManageCrudDep,
    redis: RedisDep,
) -> Response[UserManageResponse]:
    """更新用户信息。"""
    update_data = body.model_dump(exclude_unset=True)

    if not current_user.is_admin:
        update_data.pop("is_admin", None)

    if "roles" in update_data:
        target_user = await user_crud.get(user_id, nullable=False)
        if set(update_data["roles"]) != set(target_user.roles or []):
            await invalidate_user_permission_cache(redis, user_id)

    user = await user_crud.update_by_id(user_id, update_data)
    await invalidate_user_cache(redis, user_id)
    logger.info("User updated: {user_id}", user_id=user_id)
    return Response(data=UserManageResponse.model_validate(user))


@router.delete("/{user_id}")
async def delete_user(
    user_id: UUID,
    current_user: VerifyPermissionDep,
    user_crud: UserManageCrudDep,
    redis: RedisDep,
) -> Response[bool]:
    """删除单个用户。"""
    if user_id == current_user.id:
        raise AppException(StatusCode.BAD_REQUEST)

    target = await user_crud.get(user_id, nullable=False)
    if target.is_admin:
        raise AppException(StatusCode.BAD_REQUEST)

    await user_crud.delete(user_id)
    logger.warning("User deleted: {user_id} by {operator}", user_id=user_id, operator=current_user.id)
    await invalidate_user_cache(redis, user_id)
    await invalidate_user_session(redis, user_id)
    return Response(data=True)


@router.delete("")
async def batch_delete_users(
    body: UserManageBatchBody,
    current_user: VerifyPermissionDep,
    user_crud: UserManageCrudDep,
    redis: RedisDep,
) -> Response[bool]:
    """批量删除用户。"""
    targets = await user_crud.get_by_ids(body.ids)
    for target in targets:
        if target.id == current_user.id:
            raise AppException(StatusCode.BAD_REQUEST)
        if target.is_admin:
            raise AppException(StatusCode.BAD_REQUEST)

    await user_crud.delete_all(body.ids)
    logger.warning(
        "Users batch deleted: {count} users by {operator}",
        count=len(body.ids),
        operator=current_user.id,
    )

    for uid in body.ids:
        await invalidate_user_cache(redis, uid)
        await invalidate_user_session(redis, uid)

    return Response(data=True)
