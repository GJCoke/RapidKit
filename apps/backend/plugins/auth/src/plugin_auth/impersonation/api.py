"""Administrative impersonation lifecycle API."""

from datetime import UTC

from fastapi import APIRouter, Depends, Request
from plugin_user.models import User
from rapidkit_common.auth import DenyImpersonation
from rapidkit_common.request import get_client_ip
from rapidkit_common.schemas.response import Response
from rapidkit_core.uuid7 import uuid7
from rapidkit_framework.exceptions import AppException
from rapidkit_security import ImpersonationJWT, create_impersonation_token

from plugin_auth.auth.deps import AuthContextDep
from plugin_auth.auth_config import auth_settings
from plugin_auth.impersonation.deps import (
    ImpersonationServiceDep,
    StopClaimsDep,
    matches_record,
)
from plugin_auth.impersonation.models import EndReason, ImpersonationSession
from plugin_auth.impersonation.schemas import (
    ImpersonationCreateBody,
    ImpersonationCreated,
    ImpersonationCurrent,
    UserSummary,
)
from plugin_auth.status_codes import AuthStatusCode

router = APIRouter(prefix="/auth/impersonations", tags=["Impersonation"])


@router.post("", dependencies=[Depends(DenyImpersonation)])
async def create_impersonation(
    body: ImpersonationCreateBody,
    auth: AuthContextDep,
    service: ImpersonationServiceDep,
    request: Request,
) -> Response[ImpersonationCreated]:
    record = await service.start(
        auth.actor.id,
        body.target_user_id,
        reason=body.reason,
        ip=get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    claims = ImpersonationJWT(
        token_type="impersonation",
        sub=record.subject_user_id,
        act=record.actor_id,
        sid=record.id,
        jti=uuid7(),
        exp=int(record.expires_at.replace(tzinfo=UTC).timestamp()),
    )
    token = create_impersonation_token(claims, auth_settings.IMPERSONATION_TOKEN_KEY, auth_settings.JWT_ALG)
    async with service.session_factory() as session:
        subject = await session.get(User, record.subject_user_id)
    return Response(
        data=ImpersonationCreated(
            access_token=token,
            session_id=record.id,
            subject=UserSummary.model_validate(subject, from_attributes=True),
            expires_at=record.expires_at,
        )
    )


@router.get("/current")
async def get_current_impersonation(
    auth: AuthContextDep, service: ImpersonationServiceDep
) -> Response[ImpersonationCurrent]:
    if auth.impersonation_session_id is None:
        raise AppException(AuthStatusCode.IMPERSONATION_SESSION_INVALID)
    async with service.session_factory() as session:
        record = await session.get(ImpersonationSession, auth.impersonation_session_id)
        if record is None:
            raise AppException(AuthStatusCode.IMPERSONATION_SESSION_INVALID)
    return Response(
        data=ImpersonationCurrent(
            session_id=record.id,
            actor=UserSummary.model_validate(auth.actor, from_attributes=True),
            subject=UserSummary.model_validate(auth.subject, from_attributes=True),
            created_at=record.created_at,
            expires_at=record.expires_at,
        )
    )


@router.delete("/current")
async def stop_impersonation(claims: StopClaimsDep, service: ImpersonationServiceDep) -> Response[bool]:
    async with service.session_factory() as session:
        record = await session.get(ImpersonationSession, claims.sid)
        if not matches_record(record, claims):
            raise AppException(AuthStatusCode.IMPERSONATION_SESSION_INVALID)
    await service.end(claims.sid, EndReason.STOPPED)
    return Response(data=True)
