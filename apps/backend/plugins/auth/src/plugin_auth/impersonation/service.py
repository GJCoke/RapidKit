"""Transactional impersonation lifecycle with synchronous, fail-closed auditing."""

from plugin_user.models import User
from rapidkit_common.enums import Status
from rapidkit_common.protocols import ImpersonationAuditWriter, ImpersonationSocketCloser
from rapidkit_core.log import get_plugin_logger
from rapidkit_core.timezone import timezone
from rapidkit_framework.exceptions import AppException
from rapidkit_framework.services import get_service_optional
from sqlmodel import col, or_, select

from plugin_auth.auth_config import auth_settings
from plugin_auth.impersonation.cache import cache_active, clear_active
from plugin_auth.impersonation.models import EndReason, ImpersonationSession
from plugin_auth.status_codes import AuthStatusCode

logger = get_plugin_logger("Auth")


class ImpersonationService:
    def __init__(self, session_factory, redis, audit, socket_closer):
        self.session_factory = session_factory
        self.redis = redis
        self.audit = audit
        self.socket_closer = socket_closer

    async def start(self, actor_id, subject_id, *, reason, ip, user_agent):
        async with self.session_factory() as session:
            async with session.begin():
                actor = (await session.exec(select(User).where(User.id == actor_id).with_for_update())).first()
                subject = await session.get(User, subject_id)
                if actor is None or actor.status != Status.ON or not actor.is_admin:
                    raise AppException(AuthStatusCode.IMPERSONATION_ADMIN_REQUIRED)
                if subject is None or subject.status != Status.ON or subject.is_admin or subject.id == actor.id:
                    raise AppException(AuthStatusCode.IMPERSONATION_TARGET_INVALID)
                old = (
                    await session.exec(
                        select(ImpersonationSession)
                        .where(
                            ImpersonationSession.actor_id == actor.id,
                            col(ImpersonationSession.ended_at).is_(None),
                        )
                        .with_for_update()
                    )
                ).all()
                for item in old:
                    await self._end_in_transaction(session, item, EndReason.REPLACED)
                now = timezone.now().replace(microsecond=0)
                record = ImpersonationSession(
                    actor_id=actor.id,
                    subject_user_id=subject.id,
                    reason=reason,
                    ip=ip,
                    user_agent=user_agent,
                    created_at=now,
                    expires_at=now + auth_settings.IMPERSONATION_SESSION_EXP,
                )
                session.add(record)
                await session.flush()
                await self._audit(session, record, "impersonation.start", "success")
            for item in old:
                await self._cleanup(item)
            try:
                await cache_active(self.redis, record)
            except Exception:
                logger.warning("Impersonation cache fill failed user_id={}", actor_id)
            return record

    async def _audit(self, session, record, action, result):
        writer = self.audit if self.audit is not None else get_service_optional(ImpersonationAuditWriter)
        if writer is None:
            raise AppException(AuthStatusCode.IMPERSONATION_AUDIT_FAILED)
        try:
            actor = await session.get(User, record.actor_id)
            subject = await session.get(User, record.subject_user_id)
            await writer.append(
                session,
                {
                    "actor_id": record.actor_id,
                    "actor_name": actor.name if actor else None,
                    "actor_username": actor.username if actor else None,
                    "subject_user_id": record.subject_user_id,
                    "impersonation_session_id": record.id,
                    "action": action,
                    "resource_type": "impersonation",
                    "resource_id": str(record.id),
                    "result": result,
                    "source": "system",
                    "risk_level": "sensitive",
                    "ip": record.ip,
                    "user_agent": record.user_agent,
                    "extra_data": {
                        "reason": record.reason,
                        "end_reason": record.end_reason,
                        "subject_name": subject.name if subject else None,
                        "subject_username": subject.username if subject else None,
                    },
                    "occurred_at": timezone.now(),
                },
            )
        except AppException:
            raise
        except Exception as exc:
            raise AppException(AuthStatusCode.IMPERSONATION_AUDIT_FAILED) from exc

    async def _end_in_transaction(self, session, record, reason):
        if record.ended_at is not None:
            return False
        record.ended_at = timezone.now()
        record.end_reason = reason.value
        action = {
            EndReason.STOPPED: "impersonation.stop",
            EndReason.EXPIRED: "impersonation.expire",
            EndReason.REPLACED: "impersonation.revoke",
            EndReason.ACTOR_REVOKED: "impersonation.revoke",
            EndReason.SUBJECT_REVOKED: "impersonation.revoke",
        }[reason]
        await self._audit(session, record, action, "success")
        await session.flush()
        return True

    async def end(self, session_id, reason):
        async with self.session_factory() as session:
            async with session.begin():
                record = (
                    await session.exec(
                        select(ImpersonationSession)
                        .where(
                            ImpersonationSession.id == session_id,
                        )
                        .with_for_update()
                    )
                ).first()
                if record is None:
                    raise AppException(AuthStatusCode.IMPERSONATION_SESSION_INVALID)
                if record.ended_at is None and reason == EndReason.STOPPED and record.expires_at <= timezone.now():
                    reason = EndReason.EXPIRED
                await self._end_in_transaction(session, record, reason)
            await self._cleanup(record)
            return record

    async def _cleanup(self, record):
        try:
            await clear_active(self.redis, record)
        except Exception:
            logger.warning("Impersonation cache cleanup failed user_id={}", record.actor_id)
        try:
            closer = (
                self.socket_closer
                if self.socket_closer is not None
                else get_service_optional(ImpersonationSocketCloser)
            )
            if closer is not None:
                await closer.close_session(record.id, self.redis)
        except Exception:
            logger.warning("Impersonation socket cleanup failed user_id={}", record.actor_id)

    async def revoke_user(self, user_id, redis):
        """Database rows remain authoritative when Redis indexes are absent."""
        async with self.session_factory() as session:
            records = (
                await session.exec(
                    select(ImpersonationSession).where(
                        col(ImpersonationSession.ended_at).is_(None),
                        or_(ImpersonationSession.actor_id == user_id, ImpersonationSession.subject_user_id == user_id),
                    )
                )
            ).all()
            pending = [
                (record.id, EndReason.ACTOR_REVOKED if record.actor_id == user_id else EndReason.SUBJECT_REVOKED)
                for record in records
            ]
        for session_id, reason in pending:
            await self.end(session_id, reason)

    async def expire_due(self):
        """End at most 500 overdue sessions; the next scan continues the backlog."""
        async with self.session_factory() as session:
            ids = (
                await session.exec(
                    select(ImpersonationSession.id)
                    .where(
                        col(ImpersonationSession.ended_at).is_(None),
                        ImpersonationSession.expires_at <= timezone.now(),
                    )
                    .order_by(col(ImpersonationSession.expires_at), col(ImpersonationSession.id))
                    .limit(500)
                )
            ).all()
        for session_id in ids:
            await self.end(session_id, EndReason.EXPIRED)
