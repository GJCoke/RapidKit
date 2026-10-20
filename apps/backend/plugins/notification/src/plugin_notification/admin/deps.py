"""Dependency wiring for administrative notification APIs."""

from typing import Annotated

from fastapi import Depends
from rapidkit_common.deps import SessionDep

from plugin_notification.admin.services import AdminNotificationService
from plugin_notification.crud import MessageCRUD, OutboxCRUD, TemplateCRUD
from plugin_notification.providers import create_admin_service


def get_template_crud(session: SessionDep) -> TemplateCRUD:
    return TemplateCRUD(session)


def get_message_crud(session: SessionDep) -> MessageCRUD:
    return MessageCRUD(session)


def get_outbox_crud(session: SessionDep) -> OutboxCRUD:
    return OutboxCRUD(session)


def get_admin_service(session: SessionDep) -> AdminNotificationService:
    return create_admin_service(session)


TemplateCrudDep = Annotated[TemplateCRUD, Depends(get_template_crud)]
AdminMessageCrudDep = Annotated[MessageCRUD, Depends(get_message_crud)]
AdminOutboxCrudDep = Annotated[OutboxCRUD, Depends(get_outbox_crud)]
AdminServiceDep = Annotated[AdminNotificationService, Depends(get_admin_service)]
