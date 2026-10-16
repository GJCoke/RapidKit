"""Periodic completion of expired impersonation sessions."""

from rapidkit_common.protocols.impersonation import ImpersonationAuditWriter, ImpersonationSocketCloser
from rapidkit_framework.services import get_service_optional
from src.queues.app import app
from src.queues.deps import TaskRedis, TaskSession
from src.sio.impersonation import register_socket_closer

from plugin_auth.impersonation.service import ImpersonationService


@app.task(name="expire_impersonation_sessions")
async def expire_impersonation_sessions(redis: TaskRedis, session: TaskSession) -> None:
    register_socket_closer()
    service = ImpersonationService(
        session,
        redis,
        get_service_optional(ImpersonationAuditWriter),
        get_service_optional(ImpersonationSocketCloser),
    )
    await service.expire_due()
