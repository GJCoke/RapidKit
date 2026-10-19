"""
用户偏好 REST API：查询全部分类开关、按分类开关。

所有操作只从当前登录用户身份推导 user_id。

Author : Coke
Date   : 2026-09-04
"""

from fastapi import APIRouter
from rapidkit_common.access import Authenticated
from rapidkit_common.auth import UserDBDep
from rapidkit_common.schemas.response import Response
from rapidkit_core.log import get_plugin_logger
from rapidkit_framework.exceptions import AppException

from plugin_notification.categories import default_registry
from plugin_notification.pref_deps import PreferenceCrudDep
from plugin_notification.pref_schemas import PreferenceItemResponse, PreferenceUpdateRequest
from plugin_notification.status_codes import NotificationStatusCode

logger = get_plugin_logger("Notification")

router = APIRouter(
    prefix="/notification-preferences",
    tags=["notification-preferences"],
)


@router.get("", dependencies=[Authenticated])
async def list_preferences(
    user: UserDBDep,
    crud: PreferenceCrudDep,
) -> Response[list[PreferenceItemResponse]]:
    """获取当前用户各内置通知分类的有效偏好设置。"""
    rows = await crud.list_by_user(user.id)
    configured = {row.category: row.enabled for row in rows}
    items = [
        PreferenceItemResponse(
            category=definition.code,
            name_key=definition.name_key,
            enabled=configured.get(definition.code, True),
            closable=definition.closable,
            reserved=definition.reserved,
        )
        for definition in default_registry().all()
    ]
    return Response(data=items)


@router.put("/{category}", dependencies=[Authenticated])
async def update_preference(
    category: str,
    body: PreferenceUpdateRequest,
    user: UserDBDep,
    crud: PreferenceCrudDep,
) -> Response[PreferenceItemResponse]:
    """新增或更新当前用户指定通知分类的偏好设置。"""
    definition = default_registry().get(category)
    if definition.reserved:
        raise AppException(NotificationStatusCode.CATEGORY_RESERVED)
    if not definition.closable:
        raise AppException(NotificationStatusCode.CATEGORY_NOT_CLOSABLE)

    existing = await crud.get_by_user_and_category(user.id, category)
    if existing is None:
        await crud.create(
            {
                "user_id": user.id,
                "category": category,
                "enabled": body.enabled,
            }
        )
    else:
        await crud.update_by_id(existing.id, {"enabled": body.enabled})

    logger.info(
        "User {} set preference category={} enabled={}",
        user.id,
        category,
        body.enabled,
    )
    return Response(
        data=PreferenceItemResponse(
            category=category,
            name_key=definition.name_key,
            enabled=body.enabled,
            closable=definition.closable,
            reserved=definition.reserved,
        )
    )
