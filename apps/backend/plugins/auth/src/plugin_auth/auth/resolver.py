"""Unified token authentication; impersonation state is always database authoritative."""

import json
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC
from typing import cast
from uuid import UUID

from authlib.jose.errors import ExpiredTokenError, JoseError
from plugin_user.models import User
from pydantic import ValidationError
from rapidkit_common.enums import Status
from rapidkit_common.protocols.auth import AuthContext
from rapidkit_common.protocols.user import UserProtocol
from rapidkit_core.log import get_plugin_logger
from rapidkit_core.timezone import timezone
from rapidkit_framework.context import ctx
from rapidkit_framework.exceptions import AppException
from rapidkit_framework.identity import IdentityMetadata, bind_identity
from rapidkit_security import decode_impersonation_token, decode_token
from sqlmodel.ext.asyncio.session import AsyncSession

from plugin_auth.auth_config import auth_settings
from plugin_auth.impersonation.cache import active_key, cache_active
from plugin_auth.impersonation.models import EndReason, ImpersonationSession
from plugin_auth.status_codes import AuthStatusCode

logger = get_plugin_logger("Auth")
user_structure = "auth:user:<{user_id}>"
force_relogin_structure = "auth:force_relogin:<{user_id}>"
USER_CACHE_FIELDS = {
    "id",
    "name",
    "email",
    "username",
    "status",
    "is_admin",
    "roles",
    "department_id",
    "create_time",
    "update_time",
}


@dataclass(frozen=True)
class IdentifiedAuth:
    actor_id: UUID
    subject_user_id: UUID
    impersonation_session_id: UUID | None
    actor: User | None = None
    subject: User | None = None
    actor_name: str | None = None
    subject_name: str | None = None
    subject_username: str | None = None

    def __post_init__(self):
        # Snapshot loaded scalar values before a downstream transaction can roll back.
        actor = vars(self.actor) if self.actor is not None else {}
        subject = vars(self.subject) if self.subject is not None else {}
        object.__setattr__(self, "actor_name", actor.get("name") or actor.get("username"))
        object.__setattr__(self, "subject_name", subject.get("name"))
        object.__setattr__(self, "subject_username", subject.get("username"))


class AuthContextResolverImpl:
    def __init__(self, session_factory: Callable[[], AsyncSession], redis, impersonations):
        self.session_factory = session_factory
        self._redis = redis
        self.impersonations = impersonations

    @property
    def redis(self):
        return self._redis() if callable(self._redis) and not hasattr(self._redis, "get") else self._redis

    async def resolve(self, token, request=None, *, fresh=False):
        try:
            ordinary = decode_token(token, auth_settings.ACCESS_TOKEN_KEY)
        except (JoseError, ValidationError) as original:
            try:
                claims = decode_impersonation_token(
                    token,
                    auth_settings.IMPERSONATION_TOKEN_KEY,
                    auth_settings.JWT_ALG,
                    allow_expired=True,
                )
            except (JoseError, ValidationError) as exc:
                code = (
                    AuthStatusCode.TOKEN_EXPIRED
                    if isinstance(original, ExpiredTokenError)
                    else AuthStatusCode.TOKEN_INVALID
                )
                raise AppException(code) from exc
            try:
                auth = await self._resolve_impersonation(claims, request)
            except AppException:
                raise
            except Exception as exc:
                raise AppException(AuthStatusCode.IMPERSONATION_SESSION_INVALID) from exc
        else:
            self._publish_auth(IdentifiedAuth(ordinary.sub, ordinary.sub, None), request)
            auth = await self._resolve_normal(ordinary, fresh=fresh)
        self._publish_auth(auth, request)
        if request is not None:
            ctx.user_id = auth.subject.id
            ctx.actor_id = auth.actor.id
            ctx.impersonation_session_id = auth.impersonation_session_id
            bind_identity(
                IdentityMetadata(
                    user_id=str(auth.subject.id),
                    actor_id=str(auth.actor.id),
                    impersonation_session_id=str(auth.impersonation_session_id)
                    if auth.impersonation_session_id
                    else None,
                )
            )
        return auth

    async def _resolve_normal(self, ordinary, *, fresh=False):
        if await self.redis.exists(force_relogin_structure.format(user_id=ordinary.sub)):
            raise AppException(AuthStatusCode.TOKEN_INVALID)
        key = user_structure.format(user_id=ordinary.sub)
        cached = None if fresh else await self.redis.get(key)
        user: User | None
        if cached:
            user = User.model_validate_json(cached)
        else:
            async with self.session_factory() as session:
                user = cast(User | None, await session.get(User, ordinary.sub))
            if user is None:
                raise AppException(AuthStatusCode.USER_NOT_FOUND)
            if not fresh:
                await self.redis.set(
                    key, user.model_dump_json(include=USER_CACHE_FIELDS), ex=auth_settings.ACCESS_TOKEN_EXP
                )
        if user.status == Status.PENDING:
            raise AppException(AuthStatusCode.ACCOUNT_NOT_ACTIVATED)
        if user.status != Status.ON:
            raise AppException(AuthStatusCode.USER_DISABLED)
        return AuthContext(subject=cast(UserProtocol, user), actor=cast(UserProtocol, user))

    async def _load_participants(self, claims):
        async with self.session_factory() as session:
            record = await session.get(ImpersonationSession, claims.sid)
            if (
                record is None
                or record.ended_at is not None
                or record.actor_id != claims.act
                or record.subject_user_id != claims.sub
                or int(record.expires_at.replace(tzinfo=UTC).timestamp()) != claims.exp
            ):
                raise AppException(AuthStatusCode.IMPERSONATION_SESSION_INVALID)
            actor = await session.get(User, claims.act)
            subject = await session.get(User, claims.sub)
        return IdentifiedAuth(claims.act, claims.sub, claims.sid, actor, subject)

    def _publish_auth(self, auth, request):
        if request is not None:
            request.state.auth = auth

    async def _reject(self, session_id, reason, actor_id):
        try:
            await self.impersonations.end(session_id, reason)
        except Exception:
            logger.warning("Could not finalize invalid impersonation user_id={}", actor_id)
        raise AppException(AuthStatusCode.IMPERSONATION_SESSION_INVALID)

    async def _resolve_impersonation(self, claims, request):
        now = timezone.now()
        self._publish_auth(IdentifiedAuth(claims.act, claims.sub, claims.sid), request)
        identified = await self._load_participants(claims)
        self._publish_auth(identified, request)
        if claims.exp <= int(now.replace(tzinfo=UTC).timestamp()):
            await self._reject(claims.sid, EndReason.EXPIRED, claims.act)
        try:
            marker = await self.redis.get(active_key(claims.sid))
        except Exception:
            marker = None
        if marker:
            binding = json.loads(marker)
            if (
                binding["actor_id"] != str(claims.act)
                or binding["subject_user_id"] != str(claims.sub)
                or binding["expires_at"] != claims.exp
            ):
                raise AppException(AuthStatusCode.IMPERSONATION_SESSION_INVALID)
        else:
            async with self.session_factory() as session:
                record = await session.get(ImpersonationSession, claims.sid)
                if (
                    record is None
                    or record.actor_id != claims.act
                    or record.subject_user_id != claims.sub
                    or int(record.expires_at.replace(tzinfo=UTC).timestamp()) != claims.exp
                    or record.ended_at is not None
                    or record.expires_at <= now
                ):
                    raise AppException(AuthStatusCode.IMPERSONATION_SESSION_INVALID)
            try:
                await cache_active(self.redis, record)
            except Exception:
                logger.warning("Impersonation marker restore failed user_id={}", claims.act)
        actor, subject = identified.actor, identified.subject
        if actor is None or actor.status != Status.ON or not actor.is_admin:
            await self._reject(claims.sid, EndReason.ACTOR_REVOKED, claims.act)
        if subject is None or subject.status != Status.ON or subject.is_admin:
            await self._reject(claims.sid, EndReason.SUBJECT_REVOKED, claims.act)
        try:
            actor_revoked = await self.redis.exists(force_relogin_structure.format(user_id=claims.act))
            subject_revoked = await self.redis.exists(force_relogin_structure.format(user_id=claims.sub))
        except Exception as exc:
            raise AppException(AuthStatusCode.IMPERSONATION_SESSION_INVALID) from exc
        if actor_revoked:
            await self._reject(claims.sid, EndReason.ACTOR_REVOKED, claims.act)
        if subject_revoked:
            await self._reject(claims.sid, EndReason.SUBJECT_REVOKED, claims.act)
        return AuthContext(subject=subject, actor=actor, impersonation_session_id=claims.sid)
