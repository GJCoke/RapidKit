"""
用户管理 API 接口。

Author : Coke
Date   : 2026-04-02
"""

from datetime import date
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query

from rapidkit_common.auth import verify_user_permission
from rapidkit_common.deps import RedisDep
from rapidkit_common.schemas.response import PaginatedResponse, Response
from rapidkit_core.exceptions import AppException
from rapidkit_core.status_codes import StatusCode
from plugin_auth.role.deps import VerifyPermissionDep
from plugin_user.deps import UserManageCrudDep
from plugin_user.schemas import (
    UserManageBatchBody,
    UserManageCreate,
    UserManagePageQuery,
    UserManageResponse,
    UserManageUpdate,
)
from plugin_user.services import (
    filter_user,
    invalidate_user_permission_cache,
    invalidate_user_session,
    process_password,
)

from plugin_system.schemas import UserActivityTrend, UserStatsSummary

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


@router.get("")
async def get_users(
    query: Annotated[UserManagePageQuery, Query(...)],
    user_crud: UserManageCrudDep,
) -> Response[PaginatedResponse[UserManageResponse]]:
    """获取分页的用户列表。"""
    filters = filter_user(query.status, query.keyword)
    users = await user_crud.get_paginate(*filters, page=query.page, size=query.page_size, serializer=UserManageResponse)
    return Response(data=users)


@router.get("/{user_id}")
async def get_user(
    user_id: UUID,
    user_crud: UserManageCrudDep,
) -> Response[UserManageResponse]:
    """获取单个用户详情。"""
    user = await user_crud.get(user_id, nullable=False)
    return Response(data=UserManageResponse.model_validate(user))


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
    """更新用户信息。"""
    update_data = body.model_dump(exclude_unset=True)

    if not current_user.is_admin:
        update_data.pop("is_admin", None)

    if "password" in update_data:
        if update_data["password"] is not None:
            update_data["password"] = process_password(update_data["password"])
        else:
            del update_data["password"]

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
    """删除单个用户。"""
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
    """批量删除用户。"""
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
