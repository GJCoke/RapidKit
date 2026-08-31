"""Public password-reset API."""

from typing import Annotated

from fastapi import APIRouter, Query, Request
from rapidkit_common.deps import RedisDep, SessionDep
from rapidkit_common.schemas.response import Response

from plugin_auth.auth.deps import AuthCrudDep
from plugin_auth.password_reset.deps import PasswordResetTokenStoreDep
from plugin_auth.password_reset.schemas import (
    PasswordResetConfirmBody,
    PasswordResetRequestBody,
    PasswordResetValidateQuery,
    PasswordResetValidateResponse,
)
from plugin_auth.password_reset.service import confirm_password_reset, request_password_reset

router = APIRouter(prefix="/auth/password-reset", tags=["Auth Password Reset"])


@router.post("/request")
async def request_reset(
    body: PasswordResetRequestBody,
    request: Request,
    store: PasswordResetTokenStoreDep,
    user_crud: AuthCrudDep,
) -> Response[bool]:
    client_ip = request.client.host if request.client else "unknown"
    await request_password_reset(str(body.email), client_ip, store=store, user_crud=user_crud)
    return Response(data=True)


@router.get("/validate")
async def validate_reset(
    query: Annotated[PasswordResetValidateQuery, Query(...)],
    store: PasswordResetTokenStoreDep,
) -> Response[PasswordResetValidateResponse]:
    return Response(data=PasswordResetValidateResponse(valid=await store.exists(query.token)))


@router.post("/confirm")
async def confirm_reset(
    body: PasswordResetConfirmBody,
    store: PasswordResetTokenStoreDep,
    user_crud: AuthCrudDep,
    redis: RedisDep,
    session: SessionDep,
) -> Response[bool]:
    await confirm_password_reset(
        body.token,
        body.new_password,
        store=store,
        user_crud=user_crud,
        redis=redis,
        session=session,
    )
    return Response(data=True)
