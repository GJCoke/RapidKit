"""
用户管理 API 接口。

Author : Coke
Date   : 2026-05-11
"""

import secrets
from datetime import date
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from rapidkit_common.access import Authenticated, Require, Scope
from rapidkit_common.auth import DenyImpersonation, UserDBDep
from rapidkit_common.deps import RedisDep, SessionDep
from rapidkit_common.enums import Status
from rapidkit_common.events import (
    UserCreatedEvent,
    UserDeletedEvent,
    UserInviteRequestedEvent,
    UserPasswordChangedEvent,
    UserRolesChangedEvent,
)
from rapidkit_common.schemas.response import PaginatedResponse, Response
from rapidkit_common.transaction import after_commit
from rapidkit_core.log import get_plugin_logger
from rapidkit_core.realtime import emit_permission_changed
from rapidkit_framework.events import event_bus
from rapidkit_framework.exceptions import AppException
from rapidkit_framework.status_codes import StatusCode
from rapidkit_security import check_password, hash_password
from sqlmodel import col

from plugin_user.deps import UserManageCrudDep
from plugin_user.models import User
from plugin_user.schemas import (
    AdminContactResponse,
    ChangePasswordBody,
    UserActivityTrend,
    UserManageBatchBody,
    UserManageCreate,
    UserManageOptionResponse,
    UserManagePageQuery,
    UserManageResponse,
    UserManageUpdate,
    UsernamePinyinValidationRequest,
    UsernamePinyinValidationResponse,
    UserStatsSummary,
)
from plugin_user.services import (
    decrypt_user_password,
    filter_user,
    invalidate_user_cache,
    invalidate_user_permission_cache,
    invalidate_user_session,
    process_password,
    revoke_impersonations_for_user,
)
from plugin_user.status_codes import UserStatusCode
from plugin_user.username_pinyin import check_username_pinyin

logger = get_plugin_logger("User")


router = APIRouter(
    prefix="/users",
    tags=["User"],
)

contact_router = APIRouter(prefix="/users", tags=["User"])


def _warn_username_pinyin_mismatch(
    *,
    operation: str,
    name: str,
    username: str,
    target_user_id: UUID | None = None,
) -> None:
    """记录不含敏感信息的警告，不阻断数据保存。"""
    if check_username_pinyin(name, username).consistent:
        return
    logger.bind(
        operation=operation,
        target_user_id=str(target_user_id) if target_user_id else None,
        pinyin_mismatch=True,
    ).warning("Username does not match the canonical name pinyin")


@contact_router.get("/admin-contacts", summary="系统管理员联系方式", dependencies=[Authenticated])
async def get_admin_contacts(
    _: UserDBDep,
    user_crud: UserManageCrudDep,
) -> Response[list[AdminContactResponse]]:
    """获取已启用超级管理员的联系方式，仅返回联系所需字段。"""
    users = await user_crud.get_all(
        col(User.is_admin).is_(True),
        col(User.status) == Status.ON,
    )
    contacts = [
        AdminContactResponse.model_validate(user) for user in sorted(users, key=lambda item: (item.name, item.id))
    ]
    return Response(data=contacts)


@router.get("/stats/summary", summary="用户统计摘要", dependencies=[Require("user:stats")])
async def get_user_stats_summary(user_crud: UserManageCrudDep, redis: RedisDep) -> Response[UserStatsSummary]:
    """获取数据范围内的用户总数、今日新增、昨日新增和在线用户数。"""
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


@router.get("/stats/trend", summary="用户活跃趋势", dependencies=[Require("user:stats")])
async def get_user_stats_trend(
    user_crud: UserManageCrudDep,
    start: date = Query(..., description="开始日期"),
    end: date = Query(..., description="结束日期"),
    granularity: str = Query("day", description="粒度: hour | day"),
) -> Response[list[UserActivityTrend]]:
    """获取数据范围内的用户注册趋势。"""
    data = await user_crud.get_user_activity_trend(start, end, granularity)
    return Response(data=[UserActivityTrend(**item) for item in data])


@router.get("/all", summary="全部用户选项", dependencies=[Require("user:options")])
async def get_all_users(user_crud: UserManageCrudDep) -> Response[list[UserManageOptionResponse]]:
    """获取范围内全部用户（精简字段，用于下拉选项）。"""
    users = await user_crud.get_all(schema=UserManageOptionResponse)
    return Response(data=users)


@router.post("/validate-username-pinyin", summary="校验用户名与姓名拼音")
async def validate_username_pinyin(
    body: UsernamePinyinValidationRequest,
    _scope: Annotated[Scope, Require("user:validate-name")],
) -> Response[UsernamePinyinValidationResponse]:
    """返回标准全拼建议以及严格一致性结果。"""
    result = check_username_pinyin(body.name, body.username)
    return Response(
        data=UsernamePinyinValidationResponse(
            suggested_username=result.suggested_username,
            consistent=result.consistent,
        )
    )


@router.get("", dependencies=[Require("user:read")])
async def get_users(
    query: Annotated[UserManagePageQuery, Query(...)],
    user_crud: UserManageCrudDep,
) -> Response[PaginatedResponse[UserManageResponse]]:
    """获取范围内的分页用户列表。"""
    filters = filter_user(query.status, query.keyword)
    users = await user_crud.get_paginate(
        *filters,
        page=query.page,
        size=query.page_size,
        order_by=col(User.create_time).desc(),
        schema=UserManageResponse,
    )
    return Response(data=users)


@router.get("/{user_id}", dependencies=[Require("user:read")])
async def get_user(user_id: UUID, user_crud: UserManageCrudDep) -> Response[UserManageResponse]:
    """获取范围内单个用户详情；范围外与不存在同样返回 RESOURCE_NOT_FOUND。"""
    user = await user_crud.get(user_id, nullable=False)
    return Response(data=UserManageResponse.model_validate(user))


@contact_router.put(
    "/{user_id}/password",
    summary="修改用户密码",
    dependencies=[Depends(DenyImpersonation)],
)
async def change_password(
    user_id: UUID,
    body: ChangePasswordBody,
    scope: Annotated[Scope, Require("user:reset-password")],
    user_crud: UserManageCrudDep,
    redis: RedisDep,
    session: SessionDep,
) -> Response[bool]:
    """修改用户密码。仅本人或超管可操作。"""
    current_user = scope.user
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
    user_crud: UserManageCrudDep,
    scope: Annotated[Scope, Require("user:create")],
) -> Response[UserManageResponse]:
    """创建待激活用户，密码由邀请流程设置；新用户必须落在数据范围内（由会话范围校验）。"""
    current_user = scope.user
    if not current_user.is_admin:
        body.is_admin = False

    _warn_username_pinyin_mismatch(operation="create", name=body.name, username=body.username)

    create_data = body.model_dump()
    create_data["status"] = Status.PENDING
    create_data["password"] = hash_password(secrets.token_urlsafe(32))
    user = await user_crud.create(create_data)
    event_bus.fire_and_forget(UserCreatedEvent(user_id=str(user.id)))
    logger.info("Pending user created: {user_id} by {operator}", user_id=user.id, operator=current_user.id)
    return Response(data=UserManageResponse.model_validate(user))


@router.post("/{user_id}/resend-invite", summary="重新发送邀请")
async def resend_invite(
    user_id: UUID,
    user_crud: UserManageCrudDep,
    scope: Annotated[Scope, Require("user:create")],
) -> Response[bool]:
    """为范围内的待激活用户重新发送邀请。"""
    target = await user_crud.get(user_id, nullable=False)
    if target.status != Status.PENDING:
        raise AppException(UserStatusCode.USER_NOT_PENDING)
    event_bus.fire_and_forget(UserInviteRequestedEvent(user_id=str(user_id)))
    logger.info("Invite resend requested for {user_id} by {operator}", user_id=user_id, operator=scope.user.id)
    return Response(data=True)


@router.put("/{user_id}")
async def update_user(
    user_id: UUID,
    body: UserManageUpdate,
    scope: Annotated[Scope, Require("user:update")],
    user_crud: UserManageCrudDep,
    redis: RedisDep,
    session: SessionDep,
) -> Response[UserManageResponse]:
    """更新用户信息；目标与更新结果都必须在数据范围内（由会话范围校验）。"""
    current_user = scope.user
    update_data = body.model_dump(exclude_unset=True)

    if not current_user.is_admin:
        update_data.pop("is_admin", None)

    target_user = await user_crud.get(user_id, nullable=False)

    if {"name", "username"} & update_data.keys():
        _warn_username_pinyin_mismatch(
            operation="update",
            name=update_data.get("name", target_user.name),
            username=update_data.get("username", target_user.username),
            target_user_id=user_id,
        )

    permission_changed = False
    if "roles" in update_data:
        if set(update_data["roles"]) != set(target_user.roles or []):
            permission_changed = True
            after_commit(session, invalidate_user_permission_cache, redis, user_id)
            event_bus.fire_and_forget(UserRolesChangedEvent(user_id=str(user_id), role_codes=update_data["roles"]))

    if "is_admin" in update_data:
        permission_changed = permission_changed or update_data["is_admin"] != target_user.is_admin

    if any(key in update_data and update_data[key] != getattr(target_user, key) for key in ("status", "is_admin")):
        after_commit(session, revoke_impersonations_for_user, user_id, redis)

    user = await user_crud.update_by_id(user_id, update_data)
    after_commit(session, invalidate_user_cache, redis, user_id)
    if permission_changed:
        after_commit(session, emit_permission_changed, "user", user_id=user_id)
    logger.info("User updated: {user_id}", user_id=user_id)
    return Response(data=UserManageResponse.model_validate(user))


@router.delete("/{user_id}")
async def delete_user(
    user_id: UUID,
    scope: Annotated[Scope, Require("user:delete")],
    user_crud: UserManageCrudDep,
    redis: RedisDep,
    session: SessionDep,
) -> Response[bool]:
    """删除单个用户。"""
    current_user = scope.user
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
    scope: Annotated[Scope, Require("user:delete")],
    user_crud: UserManageCrudDep,
    redis: RedisDep,
    session: SessionDep,
) -> Response[bool]:
    """批量删除用户。"""
    current_user = scope.user
    targets = await user_crud.get_by_ids(body.ids)
    if len(targets) != len(set(body.ids)):
        raise AppException(StatusCode.RESOURCE_NOT_FOUND)
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
