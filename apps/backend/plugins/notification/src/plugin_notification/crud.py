"""通知插件 —— CRUD。"""

from uuid import UUID

from rapidkit_common.crud import BaseCRUD
from sqlmodel import col, func, select

from plugin_notification.models import (
    NotificationAudience,
    NotificationMessage,
    NotificationOutbox,
    UserNotification,
)


class MessageCRUD(BaseCRUD[NotificationMessage]):
    """通知消息操作。"""

    model = NotificationMessage

    async def get_by_source_dedup(self, source: str, dedup_key: str) -> NotificationMessage | None:
        statement = select(NotificationMessage).where(
            col(NotificationMessage.source) == source,
            col(NotificationMessage.deduplication_key) == dedup_key,
        )
        result = await self.session.exec(statement)
        return result.first()


class AudienceCRUD(BaseCRUD[NotificationAudience]):
    """通知受众快照操作。"""

    model = NotificationAudience


class OutboxCRUD(BaseCRUD[NotificationOutbox]):
    """通知投递 Outbox 操作。"""

    model = NotificationOutbox


class UserNotificationCRUD(BaseCRUD[UserNotification]):
    """用户收件箱操作。"""

    model = UserNotification

    async def get_unread_count(self, user_id: UUID) -> int:
        statement = (
            select(func.count())
            .select_from(UserNotification)
            .where(
                col(UserNotification.user_id) == user_id,
                col(UserNotification.read_at).is_(None),
                col(UserNotification.deleted_at).is_(None),
            )
        )
        result = await self.session.exec(statement)
        return int(result.one())

    async def get_for_user(self, user_id: UUID, notification_id: UUID) -> UserNotification | None:
        statement = select(UserNotification).where(
            col(UserNotification.id) == notification_id,
            col(UserNotification.user_id) == user_id,
            col(UserNotification.deleted_at).is_(None),
        )
        result = await self.session.exec(statement)
        return result.first()

    async def paginate_inbox(
        self,
        user_id: UUID,
        *,
        cursor: UUID | None = None,
        size: int = 20,
        unread_only: bool = False,
        include_archived: bool = False,
    ) -> tuple[list[UserNotification], UUID | None]:
        """返回用户收件箱的倒序游标页。"""
        filters = [
            col(UserNotification.user_id) == user_id,
            col(UserNotification.deleted_at).is_(None),
        ]
        if unread_only:
            filters.append(col(UserNotification.read_at).is_(None))
        if not include_archived:
            filters.append(col(UserNotification.archived_at).is_(None))
        if cursor is not None:
            filters.append(col(UserNotification.id) < cursor)

        statement = select(UserNotification).where(*filters).order_by(col(UserNotification.id).desc()).limit(size + 1)
        result = await self.session.exec(statement)
        records = list(result.all())
        has_next = len(records) > size
        if has_next:
            records = records[:size]
        next_cursor = records[-1].id if has_next and records else None
        return records, next_cursor
