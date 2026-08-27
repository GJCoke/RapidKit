"""Public invite validation and password-setting API."""

from fastapi import APIRouter, Query
from rapidkit_common.schemas.response import Response

from plugin_auth.auth.deps import AuthCrudDep
from plugin_auth.invite.deps import InviteTokenStoreDep
from plugin_auth.invite.schemas import InviteValidateResponse, SetPasswordBody
from plugin_auth.invite.service import set_password_with_token

router = APIRouter(prefix="/auth/invite", tags=["Auth Invite"])


@router.get("/validate")
async def validate_invite(
    invite_store: InviteTokenStoreDep,
    token: str = Query(..., description="邀请令牌"),
) -> Response[InviteValidateResponse]:
    return Response(data=InviteValidateResponse(valid=await invite_store.exists(token)))


@router.post("/set-password")
async def set_password(
    body: SetPasswordBody,
    invite_store: InviteTokenStoreDep,
    user_crud: AuthCrudDep,
) -> Response[bool]:
    await set_password_with_token(body.token, body.new_password, invite_store=invite_store, user_crud=user_crud)
    return Response(data=True)
