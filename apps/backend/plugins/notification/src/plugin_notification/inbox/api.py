"""通知插件 —— 用户收件箱 REST API。

所有操作从当前用户身份推导 user_id，不接受客户端指定他人 user_id。
"""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Query
from rapidkit_common.access import Authenticated
from rapidkit_common.auth import UserDBDep
from rapidkit_common.deps import SessionDep
from rapidkit_common.schemas.response import Response
from rapidkit_core.log import get_plugin_logger

from plugin_notification.banner.deps import BannerServiceDep
from plugin_notification.banner.schemas import TopBannerResponse
from plugin_notification.inbox.deps import InboxCrudDep
from plugin_notification.inbox.schemas import InboxListQuery, InboxPage, UnreadCount
from plugin_notification.inbox_projection import to_inbox_item

logger = get_plugin_logger("Notification")

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("", dependencies=[Authenticated])
async def list_notifications(
    query: Annotated[InboxListQuery, Query(...)],
    user: UserDBDep,
    crud: InboxCrudDep,
) -> Response[InboxPage]:
    """列出当前用户的收件箱。"""
    rows, next_cursor = await crud.paginate_inbox_items(
        user.id,
        cursor=query.cursor,
        size=query.size,
        unread_only=query.unread_only,
        archived=query.archived,
        category=query.category,
        level=query.level,
        created_from=query.created_from,
        created_to=query.created_to,
    )
    items = [to_inbox_item(row, message) for row, message in rows]
    return Response(data=InboxPage(items=items, next_cursor=next_cursor, size=query.size))


@router.get("/unread-count", dependencies=[Authenticated])
async def get_unread_count(user: UserDBDep, crud: InboxCrudDep) -> Response[UnreadCount]:
    """返回当前用户未读通知数。"""
    count = await crud.get_unread_count(user.id)
    return Response(data=UnreadCount(count=count))


@router.post("/read-all", dependencies=[Authenticated])
async def mark_all_read(user: UserDBDep, crud: InboxCrudDep) -> Response[None]:
    """把当前用户所有未删除、未撤回的未读通知标记为已读。"""
    await crud.mark_all_read(user.id)
    logger.info("All notifications marked read: user_id={user_id}", user_id=user.id)
    return Response(data=None)


@router.get("/top-banner", dependencies=[Authenticated])
async def get_top_banner(user: UserDBDep, session: SessionDep, banner: BannerServiceDep) -> Response[TopBannerResponse]:
    """获取当前用户可见的顶部公告及其展示状态。"""
    return Response(data=await banner.snapshot(session, user=user))


@router.patch("/{notification_id}/read", dependencies=[Authenticated])
async def mark_read(
    notification_id: UUID,
    user: UserDBDep,
    crud: InboxCrudDep,
) -> Response[None]:
    """把当前用户的一条未撤回通知标记为已读。"""
    if await crud.mark_read_for_user(user.id, notification_id):
        logger.info(
            "Notification marked read: user_id={user_id}, notification_id={notification_id}",
            user_id=user.id,
            notification_id=notification_id,
        )
    return Response(data=None)


@router.patch("/{notification_id}/archive", dependencies=[Authenticated])
async def archive_notification(
    notification_id: UUID,
    user: UserDBDep,
    crud: InboxCrudDep,
) -> Response[None]:
    """归档当前用户的一条通知。"""
    if await crud.archive_for_user(user.id, notification_id):
        logger.info(
            "Notification archived: user_id={user_id}, notification_id={notification_id}",
            user_id=user.id,
            notification_id=notification_id,
        )
    return Response(data=None)


@router.delete("/{notification_id}", dependencies=[Authenticated])
async def delete_notification(
    notification_id: UUID,
    user: UserDBDep,
    crud: InboxCrudDep,
) -> Response[None]:
    """软删除当前用户的一条通知。"""
    await crud.delete_for_user(user.id, notification_id)
    logger.warning(
        "Notification deleted: user_id={user_id}, notification_id={notification_id}",
        user_id=user.id,
        notification_id=notification_id,
    )
    return Response(data=None)
