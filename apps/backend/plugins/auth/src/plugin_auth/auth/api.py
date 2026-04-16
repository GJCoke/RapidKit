"""
Auth Api.

Author : Coke
Date   : 2025-03-11
"""

from fastapi import APIRouter, Depends
from rapidkit_common.deps import RedisDep, check_debug
from rapidkit_common.schemas.response import Response
from rapidkit_core.auth_config import auth_settings
from rapidkit_core.events import ActivityLogEvent, event_bus
from rapidkit_core.log import logger
from rapidkit_core.security import AccessJWT
from rapidkit_core.uuid7 import uuid8

from plugin_auth.auth.deps import (
    AuthCrudDep,
    HeaderUserAgentDep,
    OAuth2Form,
    UserAccessJWTDep,
    UserDBDep,
    UserRefreshDep,
    UserRefreshJWTDep,
    refresh_structure,
)
from plugin_auth.auth.schemas import (
    LoginRequest,
    OAuth2TokenResponse,
    TokenResponse,
    UserInfoResponse,
)
from plugin_auth.auth.services import create_access_token, refresh_user_token, user_login
from plugin_auth.role.deps import RoleCrudDep, get_user_permission_cache, permission_structure

router = APIRouter(prefix="/auth", tags=["Auth"])


@router.get("/keys/public")
async def get_public_key() -> Response[str]:
    """得到用于 RSA 加密密码的公开密钥。"""
    return Response(data=auth_settings.RSA_PUBLIC_KEY.get_secret_value())


@router.post("/login")
async def login(
    body: LoginRequest,
    auth: AuthCrudDep,
    role: RoleCrudDep,
    redis: RedisDep,
    user_agent: HeaderUserAgentDep,
) -> Response[TokenResponse]:
    """用户登录端点。"""
    token = await user_login(
        body.username,
        body.password,
        user_crud=auth,
        role_crud=role,
        redis=redis,
        user_agent=user_agent,
    )

    event_bus.fire_and_forget(
        ActivityLogEvent(event_type="user_login", params={"name": body.username}),
        source="auth",
    )

    return Response(data=token)


@router.post("/logout")
async def logout(auth: UserAccessJWTDep, redis: RedisDep) -> Response[bool]:
    """登出当前用户。"""
    token = refresh_structure.format(user_id=auth.sub, jti=auth.jti)
    if await redis.exists(token):
        await redis.delete(token)

    permission_key = permission_structure.format(user_id=auth.sub)
    if await redis.exists(permission_key):
        await redis.delete(permission_key)

    logger.info("[Auth] User {user_id} logged out", user_id=auth.sub)
    return Response(data=True)


@router.post("/token/refresh")
async def refresh_token(
    jwt_user: UserRefreshJWTDep,
    user: UserRefreshDep,
    role: RoleCrudDep,
    redis: RedisDep,
    user_agent: HeaderUserAgentDep,
) -> Response[TokenResponse]:
    """使用刷新令牌刷新用户的访问令牌。"""
    token = await refresh_user_token(jwt_user.jti, user, role, redis, user_agent)
    return Response(data=token)


@router.post("/login/swagger", include_in_schema=False, dependencies=[Depends(check_debug)])
async def login_swagger(form: OAuth2Form, auth: AuthCrudDep) -> OAuth2TokenResponse:
    """通过 Swagger 登录验证用户并生成访问令牌。"""
    user_info = await auth.get_user_by_username(form.username)
    token = create_access_token(
        AccessJWT.model_validate(
            {
                "sub": user_info.id,
                "name": user_info.name,
                "jti": uuid8(),
            }
        )
    )
    return OAuth2TokenResponse(access_token=token, token_type="bearer")


@router.get("/user/info")
async def get_user_info(user: UserDBDep, redis: RedisDep, role_crud: RoleCrudDep) -> Response[UserInfoResponse]:
    """检索当前的用户信息。"""
    user_data = UserInfoResponse.model_validate(user)

    if not user.is_admin:
        cache = await get_user_permission_cache(user, redis, role_crud)
        user_data.buttons = cache.buttons

    return Response(data=user_data)
