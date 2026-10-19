"""
Author  : Coke
Date    : 2025-04-30
"""

from uuid import UUID

from rapidkit_common.enums import Status
from rapidkit_common.events import RoleDeletedEvent, RolePermissionsChangedEvent
from rapidkit_core.log import get_plugin_logger
from rapidkit_core.realtime import emit_permission_changed
from rapidkit_core.redis_client import AsyncRedisClient
from rapidkit_framework.events import event_bus
from sqlalchemy import ColumnElement
from sqlmodel import col, or_

from plugin_permission.models import Role
from plugin_permission.role_versions import incr_role_version

logger = get_plugin_logger("Permission")


def filter_role(status: Status | None, keyword: str) -> list[ColumnElement[bool]]:
    filter = []

    if status is not None:
        filter.append(col(Role.status) == status)

    if keyword:
        escaped = keyword.replace("%", r"\%").replace("_", r"\_")
        filter.append(or_(col(Role.name).like(f"%{escaped}%"), col(Role.code).like(f"%{escaped}%")))

    return filter


async def publish_role_change(
    redis: AsyncRedisClient,
    role_codes: list[str],
    *,
    deleted: bool = False,
    operator_id: UUID | None = None,
) -> None:
    """
    事务提交后发布角色变更：递增版本 → 触发事件（菜单版本随之递增）→ 推送瘦信号。

    推送放在最后，确保客户端拉取时各缓存版本均已更新。

    Args:
        redis: AsyncRedisClient 实例。
        role_codes: 受影响的角色编码。
        deleted: 角色是否已被删除。
        operator_id: 操作人 ID，用于日志。
    """
    codes = list(dict.fromkeys(role_codes))
    for code in codes:
        version = await incr_role_version(redis, code)
        logger.warning(
            "Role version bumped: role_code={role_code} version={version} user_id={user_id}",
            role_code=code,
            version=version,
            user_id=operator_id,
        )
        await event_bus.async_emit(RolePermissionsChangedEvent(role_code=code), source="permission")
        if deleted:
            await event_bus.async_emit(RoleDeletedEvent(role_code=code), source="permission")
    await emit_permission_changed("roles", roles=codes)
