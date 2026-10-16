"""Credential guards and independent stop authentication."""

from datetime import UTC
from typing import Annotated

from authlib.jose.errors import JoseError
from fastapi import Depends, Request
from plugin_user.models import User
from pydantic import ValidationError
from rapidkit_common.deps import RedisDep
from rapidkit_core.database import AsyncSessionLocal
from rapidkit_framework.exceptions import AppException
from rapidkit_security import ImpersonationJWT, decode_impersonation_token

from plugin_auth.auth.deps import HeaderAccessTokenDep
from plugin_auth.auth.resolver import IdentifiedAuth
from plugin_auth.auth_config import auth_settings
from plugin_auth.impersonation.models import ImpersonationSession
from plugin_auth.impersonation.service import ImpersonationService
from plugin_auth.status_codes import AuthStatusCode


def get_impersonation_service(redis: RedisDep) -> ImpersonationService:
    return ImpersonationService(AsyncSessionLocal, redis, None, None)


ImpersonationServiceDep = Annotated[ImpersonationService, Depends(get_impersonation_service)]


def get_stop_claims(token: HeaderAccessTokenDep) -> ImpersonationJWT:
    try:
        return decode_impersonation_token(
            token,
            auth_settings.IMPERSONATION_TOKEN_KEY,
            auth_settings.JWT_ALG,
            allow_expired=True,
        )
    except (JoseError, ValidationError) as exc:
        raise AppException(AuthStatusCode.IMPERSONATION_SESSION_INVALID) from exc


StopClaimsDep = Annotated[ImpersonationJWT, Depends(get_stop_claims)]


def matches_record(record: ImpersonationSession | None, claims: ImpersonationJWT) -> bool:
    return bool(
        record is not None
        and record.actor_id == claims.act
        and record.subject_user_id == claims.sub
        and int(record.expires_at.replace(tzinfo=UTC).timestamp()) == claims.exp
    )


async def DenyImpersonation(request: Request, service: ImpersonationServiceDep) -> None:
    authorization = request.headers.get("authorization", "")
    bearer = authorization[7:] if authorization.lower().startswith("bearer ") else ""
    for token in (bearer, request.headers.get("x-refresh-token", "")):
        if not token:
            continue
        try:
            claims = decode_impersonation_token(
                token,
                auth_settings.IMPERSONATION_TOKEN_KEY,
                auth_settings.JWT_ALG,
                allow_expired=True,
            )
        except JoseError, ValidationError:
            continue
        request.state.auth = IdentifiedAuth(claims.act, claims.sub, claims.sid)
        async with service.session_factory() as session:
            async with session.begin():
                record = await session.get(ImpersonationSession, claims.sid)
                if not matches_record(record, claims):
                    raise AppException(AuthStatusCode.IMPERSONATION_SESSION_INVALID)
                actor = await session.get(User, claims.act)
                subject = await session.get(User, claims.sub)
                request.state.auth = IdentifiedAuth(claims.act, claims.sub, claims.sid, actor, subject)
                await service._audit(session, record, "impersonation.denied", "failure")
        request.state.impersonation_lifecycle_audited = True
        raise AppException(AuthStatusCode.IMPERSONATION_OPERATION_DENIED)
