"""Notification ORM model and CRUD declarations."""

from datetime import datetime
from uuid import UUID, uuid4

import pytest
from plugin_notification.crud import AudienceCRUD, MessageCRUD, OutboxCRUD, PreferenceCRUD, UserNotificationCRUD
from plugin_notification.models import (
    NotificationAudience,
    NotificationMessage,
    NotificationOutbox,
    NotificationPreference,
    UserNotification,
)
import plugin_notification.models as notification_models
from sqlalchemy import JSON, DateTime, Table, UniqueConstraint


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
    assert PreferenceCRUD.model is NotificationPreference


def test_notification_message_exposes_lifecycle_metadata_without_redeclaring_created_by():
    expected_annotations = {
        "publish_at": datetime | None,
        "published_at": datetime | None,
        "expire_at": datetime | None,
        "recalled_at": datetime | None,
        "cancelled_at": datetime | None,
        "template_id": UUID | None,
    }

    for field_name, annotation in expected_annotations.items():
        assert NotificationMessage.model_fields[field_name].annotation == annotation

    table = getattr(NotificationMessage, "__table__", None)
    assert isinstance(table, Table)
    for field_name in expected_annotations:
        assert table.c[field_name].nullable is True
    for field_name in expected_annotations.keys() - {"template_id"}:
        assert isinstance(table.c[field_name].type, DateTime)
        assert table.c[field_name].type.timezone is False

    assert "created_by" in NotificationMessage.model_fields
    assert "created_by" not in NotificationMessage.__annotations__


def test_notification_template_exposes_expected_table_metadata():
    assert hasattr(notification_models, "NotificationTemplate")
    notification_template = notification_models.NotificationTemplate

    assert notification_template.__tablename__ == "notification_templates"
    table = getattr(notification_template, "__table__", None)
    assert isinstance(table, Table)
    assert isinstance(table.c.variable_schema.type, JSON)
    assert isinstance(table.c.default_channels.type, JSON)
    assert isinstance(table.c.default_action.type, JSON)
    assert any(
        isinstance(constraint, UniqueConstraint)
        and constraint.name == "uq_notification_templates_code"
        and [column.name for column in constraint.columns] == ["code"]
        for constraint in table.constraints
    )


def test_notification_preference_exposes_unique_user_category_metadata():
    """Preferences must have one explicit setting per user/category pair."""
    assert NotificationPreference.__tablename__ == "notification_preferences"
    assert NotificationPreference.model_fields["user_id"].annotation == UUID
    assert NotificationPreference.model_fields["category"].annotation is str
    assert NotificationPreference.model_fields["enabled"].annotation is bool

    table = getattr(NotificationPreference, "__table__", None)
    assert isinstance(table, Table)
    assert table.c.user_id.index is True
    assert table.c.category.index is True
    assert any(
        isinstance(constraint, UniqueConstraint)
        and constraint.name == "uq_notification_preferences_user_category"
        and [column.name for column in constraint.columns] == ["user_id", "category"]
        for constraint in table.constraints
    )


@pytest.mark.asyncio
async def test_preference_crud_finds_disabled_users_only_in_requested_category(db_session):
    """The resolver must only filter users who disabled the category being sent."""
    disabled_user, enabled_user, other_category_user = uuid4(), uuid4(), uuid4()
    crud = PreferenceCRUD(db_session)
    await crud.create({"user_id": disabled_user, "category": "user.invited", "enabled": False})
    await crud.create({"user_id": enabled_user, "category": "user.invited", "enabled": True})
    await crud.create({"user_id": other_category_user, "category": "user.mention", "enabled": False})
    await db_session.commit()

    preference = await crud.get_by_user_and_category(disabled_user, "user.invited")

    assert preference is not None
    assert preference.enabled is False
    assert await crud.get_disabled_user_ids(
        "user.invited", [disabled_user, enabled_user, other_category_user]
    ) == {disabled_user}
    assert {item.user_id for item in await crud.list_by_user(disabled_user)} == {disabled_user}
