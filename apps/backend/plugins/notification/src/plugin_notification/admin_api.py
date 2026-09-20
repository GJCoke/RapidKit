"""Administrative notification template, announcement, and delivery APIs."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Query
from rapidkit_common.auth import VerifyPermissionDep
from rapidkit_common.deps import SessionDep
from rapidkit_common.protocols.notification import (
    AudienceRule,
    NotificationAction,
    NotificationCommand,
)
from rapidkit_common.schemas.response import PaginatedResponse, Response
from rapidkit_common.transaction import after_commit
from rapidkit_framework.exceptions import AppException
from sqlalchemy import or_
from sqlmodel import col

from plugin_notification.admin_deps import (
    AdminMessageCrudDep,
    AdminOutboxCrudDep,
    AdminServiceDep,
    TemplateCrudDep,
)
from plugin_notification.admin_schemas import (
    AnnouncementCreateRequest,
    AnnouncementUpdateRequest,
    AudiencePreviewRequest,
    AudiencePreviewResponse,
    AudienceRuleIn,
    DeliveryListQuery,
    DeliveryResponse,
    DeliverySummaryResponse,
    MessageAdminDetailResponse,
    MessageAdminResponse,
    MessageListQuery,
    TemplateCreateRequest,
    TemplateListQuery,
    TemplateResponse,
    TemplateUpdateRequest,
)
from plugin_notification.audit import audit
from plugin_notification.models import (
    NotificationMessage,
    NotificationOutbox,
    NotificationTemplate,
)
from plugin_notification.status_codes import NotificationStatusCode
from plugin_notification.validation import validate_action, validate_content, validate_i18n_key, validate_json_shape

router = APIRouter(prefix="/admin", tags=["notification-admin"])


async def _audit_after_commit(
    action: str,
    operator_id: UUID,
    target_id: UUID,
) -> None:
    audit(action, operator_id=operator_id, target_id=target_id)


async def _enqueue_delivery_after_commit(service: AdminServiceDep) -> None:
    service.enqueue_delivery()


def _validate_template_payload(body: TemplateCreateRequest) -> None:
    validate_json_shape(body.variable_schema)
    validate_json_shape(body.default_action)
    validate_action(body.default_action)
    if body.content_mode == "i18n":
        validate_i18n_key(body.title_template)
        validate_i18n_key(body.content_template)
    else:
        validate_content(body.title_template, content_format="plain_text")
        validate_content(body.content_template, content_format=body.content_format or "plain_text")


@router.get("/notification-templates")
async def list_templates(
    query: Annotated[TemplateListQuery, Query(...)],
    current_user: VerifyPermissionDep,
    crud: TemplateCrudDep,
) -> Response[PaginatedResponse[TemplateResponse]]:
    filters = []
    if query.keyword:
        pattern = f"%{query.keyword}%"
        filters.append(
            or_(
                col(NotificationTemplate.code).ilike(pattern),
                col(NotificationTemplate.name).ilike(pattern),
                col(NotificationTemplate.category).ilike(pattern),
            )
        )
    if query.enabled is not None:
        filters.append(col(NotificationTemplate.enabled) == query.enabled)
    page = await crud.get_paginate(
        *filters,
        page=query.page,
        size=query.page_size,
        order_by=col(NotificationTemplate.id).desc(),
        schema=TemplateResponse,
    )
    return Response(data=page)


@router.post("/notification-templates")
async def create_template(
    body: TemplateCreateRequest,
    current_user: VerifyPermissionDep,
    crud: TemplateCrudDep,
    session: SessionDep,
) -> Response[TemplateResponse]:
    _validate_template_payload(body)
    if await crud.get_by_code(body.code) is not None:
        raise AppException(NotificationStatusCode.TEMPLATE_CODE_EXISTS)
    template = await crud.create(body.model_dump())
    after_commit(
        session,
        _audit_after_commit,
        "template.create",
        current_user.id,
        template.id,
    )
    return Response(data=TemplateResponse.model_validate(template))


@router.get("/notification-templates/{template_id}")
async def get_template(
    template_id: UUID,
    current_user: VerifyPermissionDep,
    crud: TemplateCrudDep,
) -> Response[TemplateResponse]:
    template = await crud.get(template_id)
    if template is None:
        raise AppException(NotificationStatusCode.TEMPLATE_NOT_FOUND)
    return Response(data=TemplateResponse.model_validate(template))


@router.put("/notification-templates/{template_id}")
async def update_template(
    template_id: UUID,
    body: TemplateUpdateRequest,
    current_user: VerifyPermissionDep,
    crud: TemplateCrudDep,
    session: SessionDep,
) -> Response[TemplateResponse]:
    template = await crud.get(template_id)
    if template is None:
        raise AppException(NotificationStatusCode.TEMPLATE_NOT_FOUND)
    patch = body.model_dump(exclude_unset=True)
    merged = TemplateCreateRequest.model_validate(
        {
            **TemplateResponse.model_validate(template).model_dump(),
            **patch,
        }
    )
    _validate_template_payload(merged)
    patch["version"] = template.version + 1
    updated = await crud.update_by_id(template_id, patch)
    after_commit(
        session,
        _audit_after_commit,
        "template.update",
        current_user.id,
        template_id,
    )
    return Response(data=TemplateResponse.model_validate(updated))


@router.delete("/notification-templates/{template_id}")
async def delete_template(
    template_id: UUID,
    current_user: VerifyPermissionDep,
    crud: TemplateCrudDep,
    session: SessionDep,
) -> Response[None]:
    template = await crud.get(template_id)
    if template is None:
        raise AppException(NotificationStatusCode.TEMPLATE_NOT_FOUND)
    await crud.delete(template_id)
    after_commit(
        session,
        _audit_after_commit,
        "template.delete",
        current_user.id,
        template_id,
    )
    return Response(data=None)


def _to_command(body: AnnouncementCreateRequest) -> NotificationCommand:
    action = NotificationAction.model_validate(body.action.model_dump()) if body.action is not None else None
    return NotificationCommand(
        source="admin",
        category=body.category,
        level=body.level,
        template_code=body.template_code,
        template_variables=body.template_variables,
        i18n_key=body.i18n_key,
        i18n_params=body.i18n_params,
        raw_title=body.raw_title,
        raw_content=body.raw_content,
        raw_format=body.raw_format,
        audience=[AudienceRule.model_validate(rule.model_dump()) for rule in body.audience],
        mandatory=body.mandatory,
        channels=body.channels,
        action=action,
    )


def _to_detail(message, audiences) -> MessageAdminDetailResponse:
    return MessageAdminDetailResponse.model_validate(
        {
            **MessageAdminResponse.model_validate(message).model_dump(),
            "content_params": message.content_params,
            "content_format": message.content_format,
            "channels": message.channels,
            "action": message.action,
            "meta": message.meta,
            "template_id": message.template_id,
            "template_code": message.template_code,
            "audiences": [
                AudienceRuleIn(
                    type=row.audience_type,
                    value=row.audience_value,
                    include_descendants=row.include_descendants,
                )
                for row in audiences
            ],
        }
    )


@router.get("/notifications")
async def list_announcements(
    query: Annotated[MessageListQuery, Query(...)],
    current_user: VerifyPermissionDep,
    crud: AdminMessageCrudDep,
) -> Response[PaginatedResponse[MessageAdminResponse]]:
    filters = []
    if query.status is not None:
        filters.append(col(NotificationMessage.status) == query.status.value)
    if query.category is not None:
        filters.append(col(NotificationMessage.category) == query.category)
    page = await crud.get_paginate(
        *filters,
        page=query.page,
        size=query.page_size,
        order_by=col(NotificationMessage.id).desc(),
        schema=MessageAdminResponse,
    )
    return Response(data=page)


@router.post("/notifications")
async def create_announcement(
    body: AnnouncementCreateRequest,
    current_user: VerifyPermissionDep,
    service: AdminServiceDep,
) -> Response[dict[str, str]]:
    result = await service.create_message(
        _to_command(body),
        created_by=current_user.id,
        publish_at=body.publish_at,
        expire_at=body.expire_at,
    )
    return Response(data={"messageId": str(result.message_id)})


@router.get("/notifications/{message_id}")
async def get_announcement(
    message_id: UUID,
    current_user: VerifyPermissionDep,
    service: AdminServiceDep,
) -> Response[MessageAdminDetailResponse]:
    message, audiences = await service.get_message(message_id)
    return Response(data=_to_detail(message, audiences))


@router.put("/notifications/{message_id}")
async def update_announcement(
    message_id: UUID,
    body: AnnouncementUpdateRequest,
    current_user: VerifyPermissionDep,
    service: AdminServiceDep,
) -> Response[MessageAdminDetailResponse]:
    await service.update_message(
        message_id,
        _to_command(body),
        operator_id=current_user.id,
        publish_at=body.publish_at,
        expire_at=body.expire_at,
    )
    message, audiences = await service.get_message(message_id)
    return Response(data=_to_detail(message, audiences))


@router.delete("/notifications/{message_id}")
async def delete_announcement(
    message_id: UUID,
    current_user: VerifyPermissionDep,
    service: AdminServiceDep,
) -> Response[None]:
    await service.delete_message(message_id, operator_id=current_user.id)
    return Response(data=None)


@router.post("/notifications/{message_id}/audience-preview")
async def preview_audience(
    message_id: UUID,
    body: AudiencePreviewRequest,
    current_user: VerifyPermissionDep,
    service: AdminServiceDep,
) -> Response[AudiencePreviewResponse]:
    preview = await service.preview_audience(
        [AudienceRule.model_validate(rule.model_dump()) for rule in body.audience],
        message_id=message_id,
    )
    return Response(data=AudiencePreviewResponse(total=preview.total, by_type=preview.by_type))


@router.post("/notifications/{message_id}/publish")
async def publish_announcement(
    message_id: UUID,
    current_user: VerifyPermissionDep,
    service: AdminServiceDep,
) -> Response[dict[str, int]]:
    result = await service.publish(message_id, operator_id=current_user.id)
    return Response(data={"recipientCount": result.recipient_count})


@router.post("/notifications/{message_id}/cancel")
async def cancel_announcement(
    message_id: UUID,
    current_user: VerifyPermissionDep,
    service: AdminServiceDep,
) -> Response[None]:
    await service.cancel(message_id, operator_id=current_user.id)
    return Response(data=None)


@router.post("/notifications/{message_id}/recall")
async def recall_announcement(
    message_id: UUID,
    current_user: VerifyPermissionDep,
    service: AdminServiceDep,
) -> Response[None]:
    await service.recall(message_id, operator_id=current_user.id)
    return Response(data=None)


@router.get("/notification-deliveries")
async def list_deliveries(
    query: Annotated[DeliveryListQuery, Query(...)],
    current_user: VerifyPermissionDep,
    crud: AdminOutboxCrudDep,
) -> Response[PaginatedResponse[DeliveryResponse]]:
    filters = []
    if query.message_id is not None:
        filters.append(col(NotificationOutbox.message_id) == query.message_id)
    if query.status is not None:
        filters.append(col(NotificationOutbox.status) == query.status.value)
    page = await crud.get_paginate(
        *filters,
        page=query.page,
        size=query.page_size,
        order_by=col(NotificationOutbox.id).desc(),
        schema=DeliveryResponse,
    )
    return Response(data=page)


@router.get("/notification-deliveries/{message_id}/summary")
async def delivery_summary(
    message_id: UUID,
    current_user: VerifyPermissionDep,
    crud: AdminOutboxCrudDep,
) -> Response[DeliverySummaryResponse]:
    summary = await crud.summary_by_status(message_id)
    return Response(data=DeliverySummaryResponse(message_id=message_id, by_status=summary))


@router.post("/notification-deliveries/{message_id}/retry-failed")
async def retry_failed(
    message_id: UUID,
    current_user: VerifyPermissionDep,
    crud: AdminOutboxCrudDep,
    service: AdminServiceDep,
    session: SessionDep,
) -> Response[dict[str, int]]:
    count = await crud.retry_failed(message_id)
    if count:
        after_commit(
            session,
            _audit_after_commit,
            "delivery.retry_failed",
            current_user.id,
            message_id,
        )
        after_commit(session, _enqueue_delivery_after_commit, service)
    return Response(data={"retried": count})
