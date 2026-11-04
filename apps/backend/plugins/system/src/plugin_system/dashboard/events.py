"""Socket.IO /dashboard admission and initial online count."""

from typing import Literal
from uuid import UUID

from fastapi_sio_di import SID
from rapidkit_common.deps import RedisDep
from rapidkit_common.protocols.user import UserResolver
from rapidkit_core.log import get_plugin_logger
from rapidkit_framework.identity import current_identity
from rapidkit_framework.services import get_service
from src.sio.app import socket

from plugin_system.dashboard.realtime_access import is_dashboard_realtime_allowed

logger = get_plugin_logger("System")


@socket.on("connect", namespace="/dashboard")
async def dashboard_connect(sid: SID, redis: RedisDep) -> Literal[False] | None:
    user_id = UUID(current_identity().user_id)
    user = await get_service(UserResolver).get_by_id(user_id)
    if not user or not is_dashboard_realtime_allowed(user):
        logger.bind(
            event="system.dashboard.rejected",
            outcome="rejected",
            reason_code="dashboard_realtime_forbidden",
            user_id=user_id,
        ).warning("Dashboard realtime connection forbidden")
        return False
    count = await redis.scard("online_users") or 0
    await socket.emit("dashboard:online_users", {"count": count}, to=sid, namespace="/dashboard")
    return None
