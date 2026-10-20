"""通知插件 —— CRUD。"""

from datetime import datetime
from uuid import UUID

from rapidkit_common.crud import BaseCRUD
from rapidkit_core.timezone import timezone
from rapidkit_framework.exceptions import AppException
from sqlmodel import col, func, select, update

from plugin_notification.enums import MessageStatus, OutboxStatus
from plugin_notification.models import (
    NotificationAudience,
    NotificationMessage,
    NotificationOutbox,
    NotificationPreference,
    NotificationTemplate,
    UserNotification,
)
from plugin_notification.status_codes import NotificationStatusCode


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

    async def get_for_update(self, message_id: UUID) -> NotificationMessage | None:
        """Lock one message row so lifecycle validation and mutation are atomic."""
        statement = (
            select(NotificationMessage)
            .where(col(NotificationMessage.id) == message_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
        result = await self.session.exec(statement)
        return result.first()

    async def get_due_scheduled(
        self,
        now: datetime,
        limit: int = 100,
    ) -> list[NotificationMessage]:
        """Return scheduled messages whose publication time has arrived."""
        statement = (
            select(NotificationMessage)
            .where(
                col(NotificationMessage.display_mode) == "inbox",
                col(NotificationMessage.status) == MessageStatus.SCHEDULED.value,
                col(NotificationMessage.publish_at).is_not(None),
                col(NotificationMessage.publish_at) <= now,
            )
            .order_by(col(NotificationMessage.id))
            .limit(limit)
        )
        result = await self.session.exec(statement)
        return list(result.all())

    async def get_expired_published(
        self,
        now: datetime,
        limit: int = 100,
    ) -> list[NotificationMessage]:
        """Return published messages whose expiration time has arrived."""
        statement = (
            select(NotificationMessage)
            .where(
                col(NotificationMessage.display_mode) == "inbox",
                col(NotificationMessage.status) == MessageStatus.PUBLISHED.value,
                col(NotificationMessage.expire_at).is_not(None),
                col(NotificationMessage.expire_at) <= now,
            )
            .order_by(col(NotificationMessage.id))
            .limit(limit)
        )
        result = await self.session.exec(statement)
        return list(result.all())


class AudienceCRUD(BaseCRUD[NotificationAudience]):
    """通知受众快照操作。"""

    model = NotificationAudience


class TemplateCRUD(BaseCRUD[NotificationTemplate]):
    """Notification template operations."""

    model = NotificationTemplate

    async def get_by_code(self, code: str) -> NotificationTemplate | None:
        statement = select(NotificationTemplate).where(col(NotificationTemplate.code) == code)
        result = await self.session.exec(statement)
        return result.first()


class PreferenceCRUD(BaseCRUD[NotificationPreference]):
    """User notification preference operations."""

    model = NotificationPreference

    async def get_by_user_and_category(
        self,
        user_id: UUID,
        category: str,
    ) -> NotificationPreference | None:
        statement = select(NotificationPreference).where(
            col(NotificationPreference.user_id) == user_id,
            col(NotificationPreference.category) == category,
        )
        result = await self.session.exec(statement)
        return result.first()

    async def get_disabled_user_ids(self, category: str, user_ids: list[UUID]) -> set[UUID]:
        if not user_ids:
            return set()
        statement = select(NotificationPreference.user_id).where(
            col(NotificationPreference.category) == category,
            col(NotificationPreference.enabled).is_(False),
            col(NotificationPreference.user_id).in_(user_ids),
        )
        result = await self.session.exec(statement)
        return set(result.all())

    async def list_by_user(self, user_id: UUID) -> list[NotificationPreference]:
        statement = select(NotificationPreference).where(
            col(NotificationPreference.user_id) == user_id,
        )
        result = await self.session.exec(statement)
        return list(result.all())


class OutboxCRUD(BaseCRUD[NotificationOutbox]):
    """通知投递 Outbox 操作。"""

    model = NotificationOutbox

    async def cancel_pending(self, message_id: UUID) -> int:
        """Cancel delivery work that has not started."""
        rows = await self.get_all(
            col(NotificationOutbox.message_id) == message_id,
            col(NotificationOutbox.status).in_([OutboxStatus.PENDING.value, OutboxStatus.RETRYING.value]),
        )
        for row in rows:
            row.status = OutboxStatus.CANCELLED.value
            row.locked_by = None
            row.locked_until = None
            self.session.add(row)
        await self.session.flush()
        return len(rows)

    async def summary_by_status(self, message_id: UUID) -> dict[str, int]:
        statement = (
            select(NotificationOutbox.status, func.count())
            .where(col(NotificationOutbox.message_id) == message_id)
            .group_by(col(NotificationOutbox.status))
        )
        result = await self.session.exec(statement)
        return {status: int(count) for status, count in result.all()}

    async def retry_failed(self, message_id: UUID) -> int:
        message = await self.session.get(NotificationMessage, message_id)
        now = timezone.now()
        if (
            message is None
            or message.status != MessageStatus.PUBLISHED.value
            or (message.expire_at is not None and message.expire_at <= now)
        ):
            return 0
        rows = await self.get_all(
            col(NotificationOutbox.message_id) == message_id,
            col(NotificationOutbox.status) == OutboxStatus.DEAD.value,
        )
        for row in rows:
            row.status = OutboxStatus.PENDING.value
            row.attempt_count = 0
            row.last_error_code = None
            row.locked_by = None
            row.locked_until = None
            row.sent_at = None
            row.next_attempt_at = timezone.now()
            self.session.add(row)
        await self.session.flush()
        return len(rows)


class UserNotificationCRUD(BaseCRUD[UserNotification]):
    """用户收件箱操作。"""

    model = UserNotification

    async def _get_owned(self, user_id: UUID, notification_id: UUID) -> UserNotification:
        row = await self.get_for_user(user_id, notification_id)
        if row is None:
            raise AppException(NotificationStatusCode.NOTIFICATION_NOT_FOUND)
        return row

    async def mark_all_read(self, user_id: UUID) -> None:
        statement = (
            update(UserNotification)
            .where(
                col(UserNotification.user_id) == user_id,
                col(UserNotification.read_at).is_(None),
                col(UserNotification.deleted_at).is_(None),
                col(UserNotification.message_id).in_(
                    select(NotificationMessage.id).where(
                        col(NotificationMessage.status) != MessageStatus.RECALLED.value
                    )
                ),
            )
            .values(read_at=timezone.now())
        )
        await self.session.exec(statement)
        await self.session.flush()

    async def mark_read_for_user(self, user_id: UUID, notification_id: UUID) -> bool:
        row = await self._get_owned(user_id, notification_id)
        if row.read_at is not None:
            return False
        statement = (
            update(UserNotification)
            .where(
                col(UserNotification.id) == row.id,
                col(UserNotification.read_at).is_(None),
                col(UserNotification.message_id).in_(
                    select(NotificationMessage.id).where(
                        col(NotificationMessage.status) != MessageStatus.RECALLED.value
                    )
                ),
            )
            .values(read_at=timezone.now())
        )
        result = await self.session.exec(statement)
        await self.session.flush()
        return bool(result.rowcount)

    async def archive_for_user(self, user_id: UUID, notification_id: UUID) -> bool:
        row = await self._get_owned(user_id, notification_id)
        if row.archived_at is not None:
            return False
        row.archived_at = timezone.now()
        self.session.add(row)
        await self.session.flush()
        return True

    async def delete_for_user(self, user_id: UUID, notification_id: UUID) -> None:
        row = await self._get_owned(user_id, notification_id)
        row.deleted_at = timezone.now()
        self.session.add(row)
        await self.session.flush()

    async def get_unread_count(self, user_id: UUID) -> int:
        statement = (
            select(func.count())
            .select_from(UserNotification)
            .join(NotificationMessage, col(UserNotification.message_id) == col(NotificationMessage.id))
            .where(
                col(UserNotification.user_id) == user_id,
                col(UserNotification.read_at).is_(None),
                col(UserNotification.deleted_at).is_(None),
                col(NotificationMessage.status) != MessageStatus.RECALLED.value,
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
            filters.append(
                col(UserNotification.message_id).in_(
                    select(NotificationMessage.id).where(
                        col(NotificationMessage.status) != MessageStatus.RECALLED.value
                    )
                )
            )
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

    async def paginate_inbox_items(
        self,
        user_id: UUID,
        *,
        cursor: UUID | None = None,
        size: int = 20,
        unread_only: bool = False,
        archived: str = "active",
        category: str | None = None,
        level: str | None = None,
        created_from: datetime | None = None,
        created_to: datetime | None = None,
    ) -> tuple[list[tuple[UserNotification, NotificationMessage]], UUID | None]:
        """Return one filtered inbox cursor page with its message snapshots."""
        filters = [
            col(UserNotification.user_id) == user_id,
            col(UserNotification.deleted_at).is_(None),
            col(UserNotification.message_id) == col(NotificationMessage.id),
        ]
        if unread_only:
            filters.append(col(UserNotification.read_at).is_(None))
            filters.append(col(NotificationMessage.status) != MessageStatus.RECALLED.value)
        if archived == "active":
            filters.append(col(UserNotification.archived_at).is_(None))
        elif archived == "archived":
            filters.append(col(UserNotification.archived_at).is_not(None))
        if category is not None:
            filters.append(col(NotificationMessage.category) == category)
        if level is not None:
            filters.append(col(NotificationMessage.level) == level)
        if created_from is not None:
            filters.append(col(UserNotification.create_time) >= created_from)
        if created_to is not None:
            filters.append(col(UserNotification.create_time) <= created_to)
        if cursor is not None:
            filters.append(col(UserNotification.id) < cursor)

        statement = (
            select(UserNotification, NotificationMessage)
            .where(*filters)
            .order_by(col(UserNotification.id).desc())
            .limit(size + 1)
        )
        records = list((await self.session.exec(statement)).all())
        has_next = len(records) > size
        if has_next:
            records = records[:size]
        next_cursor = records[-1][0].id if has_next and records else None
        return records, next_cursor
