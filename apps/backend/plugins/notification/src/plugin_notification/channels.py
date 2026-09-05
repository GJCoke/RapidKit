"""
渠道适配器契约、站内渠道与注册表。

站内渠道经稳定用户 room 推送轻量事件；没有在线成员时不算失败。
"""

from collections.abc import Callable
from dataclasses import dataclass
from typing import Any, Protocol
from uuid import UUID

from rapidkit_core.log import get_plugin_logger

from plugin_notification.emitter import get_external_sio

logger = get_plugin_logger("Notification")

_NOTIFICATION_NAMESPACE = "/notifications"
_NOTIFICATION_USER_ROOM = "notification:user:<{user_id}>"


def notification_user_room(user_id: UUID | str) -> str:
    """Return the stable Socket.IO room shared by a user's notification connections."""
    return _NOTIFICATION_USER_ROOM.format(user_id=user_id)


@dataclass
class ChannelResult:
    """标准化渠道投递结果。"""

    success: bool
    error_code: str | None = None


class ChannelAdapter(Protocol):
    """渠道投递协议。"""

    async def deliver(
        self,
        *,
        redis: Any,
        user_id: UUID,
        payload: dict[str, Any],
    ) -> ChannelResult: ...


class InAppChannel:
    """通过 Socket.IO 向当前在线用户投递站内通知。"""

    def __init__(self, sio_factory: Callable[[], Any] = get_external_sio) -> None:
        self._sio_factory = sio_factory

    async def deliver(
        self,
        *,
        redis: Any,
        user_id: UUID,
        payload: dict[str, Any],
    ) -> ChannelResult:
        try:
            sio = self._sio_factory()
            await sio.emit(
                "notification:new",
                payload,
                room=notification_user_room(user_id),
                namespace=_NOTIFICATION_NAMESPACE,
            )
            return ChannelResult(success=True)
        except Exception as exc:  # noqa: BLE001
            logger.warning("InApp emit failed for user_id={}: {}", user_id, exc)
            return ChannelResult(success=False, error_code="inapp_emit_failed")


class ChannelRegistry:
    """进程内渠道适配器注册表。"""

    def __init__(self) -> None:
        self._channels: dict[str, ChannelAdapter] = {}

    def register(self, name: str, adapter: ChannelAdapter) -> None:
        self._channels[name] = adapter

    def get(self, name: str) -> ChannelAdapter | None:
        return self._channels.get(name)
