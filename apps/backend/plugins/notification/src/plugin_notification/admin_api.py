"""通知模板、公告与投递记录管理接口。"""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Query, Request
from rapidkit_common.access import Require, has_route_access
from rapidkit_common.auth import UserDBDep
from rapidkit_common.deps import SessionDep
from rapidkit_common.protocols.menu import ActionTarget, MenuNavigationProvider
from rapidkit_common.protocols.notification import (
    AudienceRule,
    NotificationAction,
    NotificationCommand,
)
from rapidkit_common.protocols.user import UserQueryService
from rapidkit_common.schemas.response import PaginatedResponse, Response
from rapidkit_common.transaction import after_commit
from rapidkit_core.config import settings
from rapidkit_core.timezone import timezone
from rapidkit_framework.exceptions import AppException
from rapidkit_framework.services import get_service
from rapidkit_framework.status_codes import StatusCode
from sqlalchemy import case, or_
from sqlmodel import col

from plugin_notification.actions import resolve_action
from plugin_notification.admin_delivery import delivery_message, enrich_deliveries
from plugin_notification.admin_deps import (
    AdminMessageCrudDep,
    AdminOutboxCrudDep,
    AdminServiceDep,
    BannerServiceDep,
    TemplateCrudDep,
)
from plugin_notification.admin_schemas import (
    ActionIn,
    AnnouncementCreateRequest,
    AnnouncementUpdateRequest,
    AudiencePreviewRequest,
    AudiencePreviewResponse,
    AudienceRuleIn,
    ContentPreviewRequest,
    ContentPreviewResponse,
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
from plugin_notification.banner_schemas import BannerCheckRequest, BannerCheckResponse, BannerPublishRequest
from plugin_notification.banner_service import BannerAnnouncementService, utc
from plugin_notification.models import (
    BANNER_STATE_ID,
    NotificationBannerState,
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


@router.get("/notification-templates", dependencies=[Require("notification-template:read")])
async def list_templates(
    query: Annotated[TemplateListQuery, Query(...)],
    current_user: UserDBDep,
    crud: TemplateCrudDep,
) -> Response[PaginatedResponse[TemplateResponse]]:
    """分页查询通知模板，支持关键词与启用状态筛选。"""
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


@router.post("/notification-templates", dependencies=[Require("notification-template:create")])
async def create_template(
    body: TemplateCreateRequest,
    current_user: UserDBDep,
    crud: TemplateCrudDep,
    session: SessionDep,
) -> Response[TemplateResponse]:
    """校验并创建通知模板，提交后记录审计日志。"""
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


@router.put("/notification-templates/{template_id}", dependencies=[Require("notification-template:update")])
async def update_template(
    template_id: UUID,
    body: TemplateUpdateRequest,
    current_user: UserDBDep,
    crud: TemplateCrudDep,
    session: SessionDep,
) -> Response[TemplateResponse]:
    """校验并更新通知模板，同时递增模板版本。"""
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


@router.delete("/notification-templates/{template_id}", dependencies=[Require("notification-template:delete")])
async def delete_template(
    template_id: UUID,
    current_user: UserDBDep,
    crud: TemplateCrudDep,
    session: SessionDep,
) -> Response[None]:
    """删除指定通知模板，提交后记录审计日志。"""
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
        variable_bindings=body.variable_bindings,
        i18n_key=body.i18n_key,
        i18n_params=body.i18n_params,
        localized_content=body.localized_content,
        raw_title=body.raw_title,
        raw_content=body.raw_content,
        raw_format=body.raw_format,
        audience=[AudienceRule(type="all")]
        if body.display_mode == "top_banner"
        else [AudienceRule.model_validate(rule.model_dump()) for rule in body.audience],
        mandatory=body.mandatory,
        channels=["in_app"] if body.display_mode == "top_banner" else body.channels,
        action=action,
    )


def _to_detail(message, audiences) -> MessageAdminDetailResponse:
    return MessageAdminDetailResponse.model_validate(
        {
            **dict(MessageAdminResponse.model_validate(message)),
            "content_params": message.content_params,
            "variable_bindings": (message.personalization or {}).get("bindings", {}),
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


@router.get("/notifications", dependencies=[Require("notification:read")])
async def list_announcements(
    query: Annotated[MessageListQuery, Query(...)],
    current_user: UserDBDep,
    crud: AdminMessageCrudDep,
) -> Response[PaginatedResponse[MessageAdminResponse]]:
    """分页查询通知公告，并返回顶部公告的当前状态。"""
    filters = []
    projection = {}
    state = await crud.session.get(NotificationBannerState, BANNER_STATE_ID)
    banner = BannerAnnouncementService()
    if state is not None:
        state, active, scheduled = await banner._load(crud.session)
        _, _, _, projection = banner._project(state, active, scheduled, timezone.now())
    status_expr = (
        case(
            *[(col(NotificationMessage.id) == key, patch["status"]) for key, patch in projection.items()],
            else_=col(NotificationMessage.status),
        )
        if projection
        else col(NotificationMessage.status)
    )
    if query.status is not None:
        filters.append(status_expr == query.status.value)
    if query.display_mode is not None:
        filters.append(col(NotificationMessage.display_mode) == query.display_mode)
    if query.category is not None:
        filters.append(col(NotificationMessage.category) == query.category)
    page = await crud.get_paginate(
        *filters,
        page=query.page,
        size=query.page_size,
        order_by=col(NotificationMessage.id).desc(),
        schema=MessageAdminResponse,
    )
    for record in page.records:
        for key, value in projection.get(record.id, {}).items():
            if key in type(record).model_fields:
                setattr(record, key, value)
    return Response(data=page)


@router.post("/notifications", dependencies=[Require("notification:create")])
async def create_announcement(
    body: AnnouncementCreateRequest,
    current_user: UserDBDep,
    service: AdminServiceDep,
    session: SessionDep,
    request: Request,
) -> Response[dict[str, str]]:
    """创建通知公告，支持草稿、定时发布和顶部公告。"""
    if body.action is not None:
        await resolve_action(body.action.model_dump(mode="json"), session=session, user=current_user, snapshot=False)
    if body.display_mode == "top_banner" and not body.save_as_draft:
        _require_publish(current_user, request)
    kwargs = {"banner_body": body} if body.display_mode == "top_banner" else {}
    result = await service.create_message(
        _to_command(body),
        created_by=current_user.id,
        publish_at=body.publish_at,
        expire_at=body.expire_at,
        save_as_draft=body.save_as_draft,
        **kwargs,
    )
    return Response(data={"messageId": str(result.message_id)})


@router.post("/notifications/audience-preview", dependencies=[Require("notification:preview")])
async def preview_unsaved_audience(
    body: AudiencePreviewRequest,
    current_user: UserDBDep,
    service: AdminServiceDep,
) -> Response[AudiencePreviewResponse]:
    """预览未保存通知的接收人数及受众类型分布。"""
    preview = await service.preview_audience(
        [AudienceRule.model_validate(rule.model_dump()) for rule in body.audience],
    )
    return Response(data=AudiencePreviewResponse(total=preview.total, by_type=preview.by_type))


@router.post("/notifications/content-preview", dependencies=[Require("notification:preview")])
async def preview_content(
    body: ContentPreviewRequest,
    request: Request,
    current_user: UserDBDep,
    service: AdminServiceDep,
) -> Response[ContentPreviewResponse]:
    """预览未保存的通知内容，不写入消息或接收人记录。"""
    if body.variable_bindings and not current_user.is_admin:
        if not has_route_access(request, f"GET:{settings.API_PREFIX_V1}/users/all"):
            raise AppException(StatusCode.FORBIDDEN)
    rendered = await service.preview_content(
        template_code=body.template_code,
        template_variables=body.template_variables,
        variable_bindings=body.variable_bindings,
        audience=[AudienceRule.model_validate(rule.model_dump()) for rule in body.audience],
        preview_user_id=body.preview_user_id,
    )
    return Response(data=ContentPreviewResponse.model_validate(rendered, from_attributes=True))


@router.get("/notifications/action-targets", dependencies=[Require("notification:preview")])
async def list_action_targets(
    current_user: UserDBDep,
    session: SessionDep,
) -> Response[list[ActionTarget]]:
    """获取当前用户可访问的通知跳转目标。"""
    return Response(data=await get_service(MenuNavigationProvider).list_targets(session, current_user))


@router.post("/notifications/action-preview", dependencies=[Require("notification:preview")])
async def preview_action(
    body: ActionIn,
    current_user: UserDBDep,
    session: SessionDep,
) -> Response[ActionIn]:
    """校验并解析当前用户可用的通知跳转动作。"""
    action = await resolve_action(body.model_dump(mode="json"), session=session, user=current_user)
    return Response(data=ActionIn.model_validate(action))


def _require_publish(user, request):
    if user.is_admin:
        return
    if not has_route_access(request, f"POST:{settings.API_PREFIX_V1}/admin/notifications/{{message_id}}/publish"):
        raise AppException(StatusCode.FORBIDDEN)


@router.post("/notifications/banner-check", dependencies=[Require("notification:preview")])
async def check_banner(
    body: BannerCheckRequest,
    current_user: UserDBDep,
    session: SessionDep,
    banner: BannerServiceDep,
) -> Response[BannerCheckResponse]:
    """校验顶部公告的展示时间范围，并返回当前公告状态。"""
    banner._validate_window(utc(body.publish_at), utc(body.expire_at))
    return Response(data=await banner.snapshot(session))


@router.get("/notifications/{message_id}", dependencies=[Require("notification:read")])
async def get_announcement(
    message_id: UUID,
    current_user: UserDBDep,
    service: AdminServiceDep,
) -> Response[MessageAdminDetailResponse]:
    """获取通知公告详情，包含受众规则与顶部公告的当前状态。"""
    message, audiences = await service.get_message(message_id)
    detail = _to_detail(message, audiences)
    if message.display_mode == "top_banner":
        async with service._session_factory() as session:
            patch = await BannerAnnouncementService().project_message(session, message)
        for key, value in patch.items():
            if key in type(detail).model_fields:
                setattr(detail, key, value)
    return Response(data=detail)


@router.put("/notifications/{message_id}", dependencies=[Require("notification:update")])
async def update_announcement(
    message_id: UUID,
    body: AnnouncementUpdateRequest,
    current_user: UserDBDep,
    service: AdminServiceDep,
    session: SessionDep,
    request: Request,
) -> Response[MessageAdminDetailResponse]:
    """更新通知公告的内容、受众和发布配置。"""
    if body.action is not None:
        await resolve_action(body.action.model_dump(mode="json"), session=session, user=current_user, snapshot=False)
    if body.display_mode == "top_banner" and not body.save_as_draft:
        _require_publish(current_user, request)
    kwargs = {"banner_body": body} if body.display_mode == "top_banner" else {}
    await service.update_message(
        message_id,
        _to_command(body),
        operator_id=current_user.id,
        publish_at=body.publish_at,
        expire_at=body.expire_at,
        save_as_draft=body.save_as_draft,
        **kwargs,
    )
    message, audiences = await service.get_message(message_id)
    return Response(data=_to_detail(message, audiences))


@router.delete("/notifications/{message_id}", dependencies=[Require("notification:delete")])
async def delete_announcement(
    message_id: UUID,
    current_user: UserDBDep,
    service: AdminServiceDep,
) -> Response[None]:
    """删除指定通知公告。"""
    await service.delete_message(message_id, operator_id=current_user.id)
    return Response(data=None)


@router.post("/notifications/{message_id}/publish", dependencies=[Require("notification:publish")])
async def publish_announcement(
    message_id: UUID,
    current_user: UserDBDep,
    service: AdminServiceDep,
    body: BannerPublishRequest | None = None,
) -> Response[dict[str, int]]:
    """发布指定通知公告，并返回接收人数。"""
    kwargs = {"banner_body": body} if body is not None else {}
    result = await service.publish(message_id, operator_id=current_user.id, **kwargs)
    return Response(data={"recipientCount": result.recipient_count})


@router.post("/notifications/{message_id}/cancel", dependencies=[Require("notification:cancel")])
async def cancel_announcement(
    message_id: UUID,
    current_user: UserDBDep,
    service: AdminServiceDep,
) -> Response[None]:
    """取消指定通知公告的发布计划。"""
    await service.cancel(message_id, operator_id=current_user.id)
    return Response(data=None)


@router.post("/notifications/{message_id}/recall", dependencies=[Require("notification:recall")])
async def recall_announcement(
    message_id: UUID,
    current_user: UserDBDep,
    service: AdminServiceDep,
) -> Response[None]:
    """撤回已发布的通知公告。"""
    await service.recall(message_id, operator_id=current_user.id)
    return Response(data=None)


@router.get("/notification-deliveries", dependencies=[Require("notification-delivery:read")])
async def list_deliveries(
    query: Annotated[DeliveryListQuery, Query(...)],
    current_user: UserDBDep,
    crud: AdminOutboxCrudDep,
) -> Response[PaginatedResponse[DeliveryResponse]]:
    """分页查询通知投递记录，并补充接收用户信息。"""
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
    if page.records:
        await enrich_deliveries(page.records, crud.session, get_service(UserQueryService))
    return Response(data=page)


@router.get("/notification-deliveries/{message_id}/summary", dependencies=[Require("notification-delivery:read")])
async def delivery_summary(
    message_id: UUID,
    current_user: UserDBDep,
    crud: AdminOutboxCrudDep,
) -> Response[DeliverySummaryResponse]:
    """获取指定通知的投递状态统计与消息摘要。"""
    summary = await crud.summary_by_status(message_id)
    message = delivery_message(await crud.session.get(NotificationMessage, message_id))
    return Response(data=DeliverySummaryResponse(message_id=message_id, by_status=summary, message=message))


@router.post(
    "/notification-deliveries/{message_id}/retry-failed", dependencies=[Require("notification-delivery:retry")]
)
async def retry_failed(
    message_id: UUID,
    current_user: UserDBDep,
    crud: AdminOutboxCrudDep,
    service: AdminServiceDep,
    session: SessionDep,
) -> Response[dict[str, int]]:
    """重新安排指定通知的失败投递，提交后触发投递任务。"""
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
