"""
用户管理 API 接口。

Author : Coke
Date   : 2026-05-11
"""

from datetime import date
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from rapidkit_common.auth import UserDBDep, VerifyPermissionDep, verify_user_permission
from rapidkit_common.field_permission import FieldPermissionFilter, FieldRestrictions, serialize_with_restrictions
from rapidkit_common.deps import RedisDep, SessionDep
from rapidkit_common.events import UserCreatedEvent, UserDeletedEvent, UserPasswordChangedEvent, UserRolesChangedEvent
from rapidkit_common.schemas.response import PaginatedResponse, Response
from rapidkit_common.transaction import after_commit
from rapidkit_core.log import get_plugin_logger
from rapidkit_framework.events import event_bus
from rapidkit_framework.exceptions import AppException
from rapidkit_security import check_password
from sqlmodel import col

from plugin_user.deps import UserManageCrudDep
from plugin_user.models import User
from plugin_user.schemas import (
    ChangePasswordBody,
    UserActivityTrend,
    UserManageBatchBody,
    UserManageCreate,
    UserManageOptionResponse,
    UserManagePageQuery,
    UserManageResponse,
    UserManageUpdate,
    UserStatsSummary,
)
from plugin_user.services import (
    decrypt_user_password,
    filter_user,
    invalidate_user_cache,
    invalidate_user_permission_cache,
    invalidate_user_session,
    process_password,
)
from plugin_user.status_codes import UserStatusCode

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
    online_count = await redis.scard("online_users") or 0
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
    field_rules: Annotated[FieldRestrictions, Depends(FieldPermissionFilter(User))],
) -> Response[PaginatedResponse[UserManageResponse]]:
    """获取分页的用户列表。"""
    filters = filter_user(query.status, query.keyword)
    users = await user_crud.get_paginate(
        *filters,
        page=query.page,
        size=query.page_size,
        order_by=col(User.create_time).desc(),
        schema=UserManageResponse,
    )
    if not field_rules.is_empty:
        users.records = [
            UserManageResponse.model_validate(serialize_with_restrictions(r.model_dump(), field_rules))
            for r in users.records
        ]
    return Response(data=users)


@router.get("/{user_id}")
async def get_user(
    user_id: UUID,
    user_crud: UserManageCrudDep,
    field_rules: Annotated[FieldRestrictions, Depends(FieldPermissionFilter(User))],
) -> Response[UserManageResponse]:
    """获取单个用户详情。"""
    user = await user_crud.get(user_id, nullable=False)
    response = UserManageResponse.model_validate(user)
    if not field_rules.is_empty:
        response = UserManageResponse.model_validate(serialize_with_restrictions(response.model_dump(), field_rules))
    return Response(data=response)


@router.put("/{user_id}/password", summary="修改用户密码")
async def change_password(
    user_id: UUID,
    body: ChangePasswordBody,
    current_user: UserDBDep,
    user_crud: UserManageCrudDep,
    redis: RedisDep,
    session: SessionDep,
) -> Response[bool]:
    """修改用户密码。仅本人或超管可操作。"""
    is_self = current_user.id == user_id

    if not is_self and not current_user.is_admin:
        raise AppException(UserStatusCode.PASSWORD_CHANGE_FORBIDDEN)

    if is_self:
        if not body.old_password:
            raise AppException(UserStatusCode.OLD_PASSWORD_REQUIRED)
        decrypted_old = decrypt_user_password(body.old_password)
        target_user = await user_crud.get(user_id, nullable=False)
        if not check_password(decrypted_old, target_user.password):
            raise AppException(UserStatusCode.OLD_PASSWORD_INCORRECT)

    new_hashed = process_password(body.new_password)
    await user_crud.update_by_id(user_id, {"password": new_hashed})

    after_commit(session, invalidate_user_cache, redis, user_id)
    after_commit(session, invalidate_user_session, redis, user_id)
    logger.warning(
        "Password changed for user {user_id} by {operator}",
        user_id=user_id,
        operator=current_user.id,
    )
    event_bus.fire_and_forget(UserPasswordChangedEvent(user_id=str(user_id)))
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
    event_bus.fire_and_forget(UserCreatedEvent(user_id=str(user.id)))
    logger.info("User created: {user_id} by {operator}", user_id=user.id, operator=current_user.id)
    return Response(data=UserManageResponse.model_validate(user))


@router.put("/{user_id}")
async def update_user(
    user_id: UUID,
    body: UserManageUpdate,
    current_user: VerifyPermissionDep,
    user_crud: UserManageCrudDep,
    redis: RedisDep,
    session: SessionDep,
) -> Response[UserManageResponse]:
    """更新用户信息。"""
    update_data = body.model_dump(exclude_unset=True)

    if not current_user.is_admin:
        update_data.pop("is_admin", None)

    if "roles" in update_data:
        target_user = await user_crud.get(user_id, nullable=False)
        if set(update_data["roles"]) != set(target_user.roles or []):
            after_commit(session, invalidate_user_permission_cache, redis, user_id)
            event_bus.fire_and_forget(UserRolesChangedEvent(user_id=str(user_id), role_codes=update_data["roles"]))

    user = await user_crud.update_by_id(user_id, update_data)
    after_commit(session, invalidate_user_cache, redis, user_id)
    logger.info("User updated: {user_id}", user_id=user_id)
    return Response(data=UserManageResponse.model_validate(user))


@router.delete("/{user_id}")
async def delete_user(
    user_id: UUID,
    current_user: VerifyPermissionDep,
    user_crud: UserManageCrudDep,
    redis: RedisDep,
    session: SessionDep,
) -> Response[bool]:
    """删除单个用户。"""
    if user_id == current_user.id:
        raise AppException(UserStatusCode.CANNOT_DELETE_SELF)

    target = await user_crud.get(user_id, nullable=False)
    if target.is_admin:
        raise AppException(UserStatusCode.CANNOT_DELETE_ADMIN)

    await user_crud.delete(user_id)
    logger.warning("User deleted: {user_id} by {operator}", user_id=user_id, operator=current_user.id)
    after_commit(session, invalidate_user_cache, redis, user_id)
    after_commit(session, invalidate_user_session, redis, user_id)
    event_bus.fire_and_forget(UserDeletedEvent(user_id=str(user_id)))
    return Response(data=True)


@router.delete("")
async def batch_delete_users(
    body: UserManageBatchBody,
    current_user: VerifyPermissionDep,
    user_crud: UserManageCrudDep,
    redis: RedisDep,
    session: SessionDep,
) -> Response[bool]:
    """批量删除用户。"""
    targets = await user_crud.get_by_ids(body.ids)
    for target in targets:
        if target.id == current_user.id:
            raise AppException(UserStatusCode.BATCH_CONTAINS_SELF)
        if target.is_admin:
            raise AppException(UserStatusCode.BATCH_CONTAINS_ADMIN)

    await user_crud.delete_all(body.ids)
    logger.warning(
        "Users batch deleted: {count} users by {operator}",
        count=len(body.ids),
        operator=current_user.id,
    )

    for uid in body.ids:
        after_commit(session, invalidate_user_cache, redis, uid)
        after_commit(session, invalidate_user_session, redis, uid)
        event_bus.fire_and_forget(UserDeletedEvent(user_id=str(uid)))

    return Response(data=True)
