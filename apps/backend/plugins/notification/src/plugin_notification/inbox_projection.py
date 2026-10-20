"""Recipient inbox projection shared by HTTP and realtime delivery."""

from rapidkit_core.timezone import timezone

from plugin_notification.inbox.schemas import NotificationItem
from plugin_notification.models import NotificationMessage, UserNotification
from plugin_notification.personalization import resolve_recipient_content


def to_inbox_item(row: UserNotification, message: NotificationMessage) -> NotificationItem:
    """Hide recalled content without modifying durable message or recipient snapshots."""
    recalled = message.status == "recalled"
    content = None if recalled else resolve_recipient_content(message, row)
    return NotificationItem(
        id=row.id,
        message_id=row.message_id,
        content_mode=content.content_mode if content is not None else "raw",
        title=content.title if content is not None else "",
        content=content.content if content is not None else "",
        content_params=content.content_params if content is not None else None,
        content_format=content.content_format if content is not None else None,
        level=message.level,
        category=message.category,
        mandatory=message.mandatory if not recalled else False,
        action=(
            None
            if message.status in {"recalled", "expired"}
            or message.expire_at is not None
            and message.expire_at <= timezone.now()
            else message.action
        ),
        status=message.status,
        expire_at=message.expire_at,
        recalled_at=message.recalled_at,
        read_at=row.read_at,
        archived_at=row.archived_at,
        create_time=row.create_time,
    )
