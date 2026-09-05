"""Notification ORM model and CRUD declarations."""

from datetime import datetime

from plugin_notification.crud import AudienceCRUD, MessageCRUD, OutboxCRUD, UserNotificationCRUD
from plugin_notification.models import (
    NotificationAudience,
    NotificationMessage,
    NotificationOutbox,
    UserNotification,
)
from sqlalchemy import DateTime, Table


def test_notification_models_expose_expected_tables_and_datetime_columns():
    assert [
        NotificationMessage.__tablename__,
        NotificationAudience.__tablename__,
        UserNotification.__tablename__,
        NotificationOutbox.__tablename__,
    ] == [
        "notification_messages",
        "notification_audiences",
        "notification_user_notifications",
        "notification_outbox",
    ]
    assert UserNotification.model_fields["read_at"].annotation == datetime | None
    user_notification_table = getattr(UserNotification, "__table__", None)
    outbox_table = getattr(NotificationOutbox, "__table__", None)
    assert isinstance(user_notification_table, Table)
    assert isinstance(outbox_table, Table)
    assert isinstance(user_notification_table.c.read_at.type, DateTime)
    assert isinstance(outbox_table.c.next_attempt_at.type, DateTime)


def test_notification_cruds_declare_their_models():
    assert MessageCRUD.model is NotificationMessage
    assert AudienceCRUD.model is NotificationAudience
    assert UserNotificationCRUD.model is UserNotification
    assert OutboxCRUD.model is NotificationOutbox
