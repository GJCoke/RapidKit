"""Readable, title-only administrative projections for one page of delivery records."""

from typing import Literal

from rapidkit_common.protocols.notification import LocalizedContent
from rapidkit_common.protocols.user import UserQueryService
from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from plugin_notification.admin_schemas import DeliveryMessageResponse, DeliveryRecipientResponse, DeliveryResponse
from plugin_notification.enums import MessageStatus
from plugin_notification.models import NotificationMessage


def delivery_message(message: NotificationMessage | None) -> DeliveryMessageResponse | None:
    if message is None:
        return None
    result = DeliveryMessageResponse(
        id=message.id,
        title=message.title,
        category=message.category,
        content_mode=message.content_mode,
        status=MessageStatus(message.status),
        published_at=message.published_at,
        expire_at=message.expire_at,
        create_time=message.create_time,
    )
    if message.content_mode == "local" and message.content_params:
        localized = LocalizedContent.model_validate(message.content_params)
        result.titles = {locale: localized.render(locale)[0] for locale in localized.translations}
        result.default_locale = localized.default_locale
    elif message.content_mode == "i18n":
        result.title_params = message.content_params
    return result


async def enrich_deliveries(records: list[DeliveryResponse], session: AsyncSession, users: UserQueryService) -> None:
    if not records:
        return
    profiles = await users.get_display_profiles(list(dict.fromkeys(record.user_id for record in records)))
    ids = {record.message_id for record in records}
    messages = (await session.exec(select(NotificationMessage).where(col(NotificationMessage.id).in_(ids)))).all()
    summaries = {message.id: delivery_message(message) for message in messages}
    states: dict[str, Literal["active", "disabled", "pending", "deleted"]] = {
        "1": "active",
        "2": "disabled",
        "3": "pending",
    }
    for record in records:
        profile = profiles.get(record.user_id)
        if profile is not None:
            record.recipient = DeliveryRecipientResponse(
                name=profile.name,
                username=profile.username,
                avatar=profile.avatar,
                department=profile.department,
                state=states.get(profile.status, "disabled"),
            )
        record.message = summaries.get(record.message_id)
