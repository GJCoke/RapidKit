"""通知插件 —— 用户收件箱 REST API。

所有操作从当前用户身份推导 user_id，不接受客户端指定他人 user_id。
"""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Query
from rapidkit_common.auth import UserDBDep
from rapidkit_common.schemas.response import Response
from rapidkit_core.log import get_plugin_logger
from rapidkit_core.timezone import timezone
from rapidkit_framework.exceptions import AppException
from sqlmodel import col, update

from plugin_notification.crud import MessageCRUD, UserNotificationCRUD
from plugin_notification.deps import InboxCrudDep
from plugin_notification.models import NotificationMessage, UserNotification
from plugin_notification.schemas import InboxListQuery, InboxPage, NotificationItem, UnreadCount
from plugin_notification.status_codes import NotificationStatusCode

logger = get_plugin_logger("Notification")

router = APIRouter(prefix="/notifications", tags=["notifications"])


def _to_item(row: UserNotification, message: NotificationMessage) -> NotificationItem:
    """将收件箱记录与消息内容合并为公开响应。"""
    return NotificationItem(
        id=row.id,
        message_id=row.message_id,
        content_mode=message.content_mode,
        title=message.title,
        content=message.content,
        content_params=message.content_params,
        content_format=message.content_format,
        level=message.level,
        category=message.category,
        mandatory=message.mandatory,
        action=message.action,
        read_at=row.read_at,
        archived_at=row.archived_at,
        create_time=row.create_time,
    )


@router.get("")
async def list_notifications(
    query: Annotated[InboxListQuery, Query(...)],
    user: UserDBDep,
    crud: InboxCrudDep,
) -> Response[InboxPage]:
    """列出当前用户的收件箱。"""
    rows, next_cursor = await crud.paginate_inbox(
        user.id,
        cursor=query.cursor,
        size=query.size,
        unread_only=query.unread_only,
        include_archived=query.include_archived,
    )
    message_crud = MessageCRUD(crud.session)
    items: list[NotificationItem] = []
    for row in rows:
        message = await message_crud.get(row.message_id)
        if message is not None:
            items.append(_to_item(row, message))
    return Response(data=InboxPage(items=items, next_cursor=next_cursor, size=query.size))


@router.get("/unread-count")
async def get_unread_count(user: UserDBDep, crud: InboxCrudDep) -> Response[UnreadCount]:
    """返回当前用户未读通知数。"""
    count = await crud.get_unread_count(user.id)
    return Response(data=UnreadCount(count=count))


@router.post("/read-all")
async def mark_all_read(user: UserDBDep, crud: InboxCrudDep) -> Response[None]:
    """把当前用户所有未删除的未读通知标记为已读。"""
    statement = (
        update(UserNotification)
        .where(
            col(UserNotification.user_id) == user.id,
            col(UserNotification.read_at).is_(None),
            col(UserNotification.deleted_at).is_(None),
        )
        .values(read_at=timezone.now())
    )
    await crud.session.exec(statement)
    await crud.session.flush()
    logger.info("All notifications marked read: user_id={user_id}", user_id=user.id)
    return Response(data=None)


@router.get("/{notification_id}")
async def get_notification(
    notification_id: UUID,
    user: UserDBDep,
    crud: InboxCrudDep,
) -> Response[NotificationItem]:
    """获取当前用户的一条通知。"""
    row = await _get_current_user_notification(crud, user.id, notification_id)
    message = await MessageCRUD(crud.session).get(row.message_id)
    if message is None:
        raise AppException(NotificationStatusCode.NOTIFICATION_NOT_FOUND)
    return Response(data=_to_item(row, message))


@router.patch("/{notification_id}/read")
async def mark_read(
    notification_id: UUID,
    user: UserDBDep,
    crud: InboxCrudDep,
) -> Response[None]:
    """把当前用户的一条通知标记为已读。"""
    row = await _get_current_user_notification(crud, user.id, notification_id)
    if row.read_at is None:
        row.read_at = timezone.now()
        crud.session.add(row)
        await crud.session.flush()
        logger.info(
            "Notification marked read: user_id={user_id}, notification_id={notification_id}",
            user_id=user.id,
            notification_id=notification_id,
        )
    return Response(data=None)


@router.patch("/{notification_id}/archive")
async def archive_notification(
    notification_id: UUID,
    user: UserDBDep,
    crud: InboxCrudDep,
) -> Response[None]:
    """归档当前用户的一条通知。"""
    row = await _get_current_user_notification(crud, user.id, notification_id)
    if row.archived_at is None:
        row.archived_at = timezone.now()
        crud.session.add(row)
        await crud.session.flush()
        logger.info(
            "Notification archived: user_id={user_id}, notification_id={notification_id}",
            user_id=user.id,
            notification_id=notification_id,
        )
    return Response(data=None)


@router.delete("/{notification_id}")
async def delete_notification(
    notification_id: UUID,
    user: UserDBDep,
    crud: InboxCrudDep,
) -> Response[None]:
    """软删除当前用户的一条通知。"""
    row = await _get_current_user_notification(crud, user.id, notification_id)
    row.deleted_at = timezone.now()
    crud.session.add(row)
    await crud.session.flush()
    logger.warning(
        "Notification deleted: user_id={user_id}, notification_id={notification_id}",
        user_id=user.id,
        notification_id=notification_id,
    )
    return Response(data=None)


async def _get_current_user_notification(
    crud: UserNotificationCRUD,
    user_id: UUID,
    notification_id: UUID,
) -> UserNotification:
    """按当前用户归属读取通知，避免暴露其他用户记录是否存在。"""
    row = await crud.get_for_user(user_id, notification_id)
    if row is None:
        raise AppException(NotificationStatusCode.NOTIFICATION_NOT_FOUND)
    return row
