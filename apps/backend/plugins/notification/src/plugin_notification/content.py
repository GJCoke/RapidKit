"""Shared safe content resolution without recipient queries or delivery writes."""

from uuid import UUID

from rapidkit_common.protocols.notification import NotificationCommand
from rapidkit_framework.exceptions import AppException
from sqlmodel.ext.asyncio.session import AsyncSession

from plugin_notification.crud import TemplateCRUD
from plugin_notification.personalization import prepare_personalization
from plugin_notification.renderer import RenderedContent
from plugin_notification.status_codes import NotificationStatusCode
from plugin_notification.validation import (
    validate_content,
    validate_i18n_key,
    validate_json_shape,
    validate_localized_content,
)


async def resolve_content(
    session: AsyncSession, command: NotificationCommand
) -> tuple[RenderedContent, UUID | None, dict | None]:
    """Resolve command content into the immutable snapshot stored on a message."""
    if command.content_mode == "template":
        if command.template_code is None:
            raise AppException(NotificationStatusCode.INVALID_COMMAND)
        template = await TemplateCRUD(session).get_by_code(command.template_code)
        if template is None:
            raise AppException(NotificationStatusCode.TEMPLATE_NOT_FOUND)
        rendered, config = prepare_personalization(template, command.template_variables, command.variable_bindings)
        return rendered, template.id, config

    if command.content_mode == "local":
        if command.localized_content is None:
            raise AppException(NotificationStatusCode.INVALID_COMMAND)
        title, content, envelope = validate_localized_content(command.localized_content)
        return (
            RenderedContent(
                content_mode="local",
                title=title,
                content=content,
                content_params=envelope,
                content_format="plain_text",
            ),
            None,
            None,
        )

    if command.content_mode == "i18n":
        validate_i18n_key(command.i18n_key or "")
        validate_json_shape(command.i18n_params)
        return (
            RenderedContent(
                content_mode="i18n",
                title=command.i18n_key or "",
                content=command.i18n_key or "",
                content_params=command.i18n_params,
                content_format=None,
            ),
            None,
            None,
        )

    validate_content(command.raw_title or "", content_format="plain_text")
    validate_content(command.raw_content or "", content_format=command.raw_format)
    return (
        RenderedContent(
            content_mode="raw",
            title=command.raw_title or "",
            content=command.raw_content or "",
            content_params=None,
            content_format=command.raw_format,
        ),
        None,
        None,
    )
