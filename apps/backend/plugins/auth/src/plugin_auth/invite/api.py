"""公开的邀请校验与密码设置接口。"""

from fastapi import APIRouter, Query
from rapidkit_common.access import Public
from rapidkit_common.schemas.response import Response

from plugin_auth.auth.deps import AuthCrudDep
from plugin_auth.invite.deps import InviteTokenStoreDep
from plugin_auth.invite.schemas import InviteValidateResponse, SetPasswordBody
from plugin_auth.invite.service import set_password_with_token

router = APIRouter(prefix="/auth/invite", tags=["Auth Invite"])


@router.get("/validate", dependencies=[Public])
async def validate_invite(
    invite_store: InviteTokenStoreDep,
    token: str = Query(..., description="邀请令牌"),
) -> Response[InviteValidateResponse]:
    """校验邀请令牌是否有效。"""
    return Response(data=InviteValidateResponse(valid=await invite_store.exists(token)))


@router.post("/set-password", dependencies=[Public])
async def set_password(
    body: SetPasswordBody,
    invite_store: InviteTokenStoreDep,
    user_crud: AuthCrudDep,
) -> Response[bool]:
    """使用邀请令牌设置用户密码并完成账号激活。"""
    await set_password_with_token(body.token, body.new_password, invite_store=invite_store, user_crud=user_crud)
    return Response(data=True)
