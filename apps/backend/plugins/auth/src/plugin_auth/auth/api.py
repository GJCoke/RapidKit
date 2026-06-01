"""
Auth Api.

Author : Coke
Date   : 2025-03-11
"""

from typing import cast

from fastapi import APIRouter, Depends
from rapidkit_common.deps import RedisDep, check_debug
from rapidkit_common.events import UserLogoutEvent
from rapidkit_common.protocols.permission import PermissionCacheManager
from rapidkit_common.protocols.user import UserProtocol
from rapidkit_common.schemas.response import Response
from rapidkit_core.log import get_plugin_logger
from rapidkit_framework.events import event_bus
from rapidkit_framework.exceptions import AppException
from rapidkit_framework.services import get_service
from rapidkit_security import check_password

from plugin_auth.auth.deps import (
    AuthCrudDep,
    HeaderUserAgentDep,
    OAuth2Form,
    TokenStoreDep,
    UserAccessJWTDep,
    UserDBDep,
    UserRefreshDep,
    UserRefreshJWTDep,
)
from plugin_auth.auth.schemas import (
    LoginRequest,
    OAuth2TokenResponse,
    TokenResponse,
    UserInfoResponse,
)
from plugin_auth.auth.services import refresh_user_token, user_login
from plugin_auth.auth_config import auth_settings
from plugin_auth.status_codes import AuthStatusCode

logger = get_plugin_logger("Auth")

router = APIRouter(prefix="/auth", tags=["Auth"])


@router.get("/keys/public")
async def get_public_key() -> Response[str]:
    """得到用于 RSA 加密密码的公开密钥。"""
    return Response(data=auth_settings.RSA_PUBLIC_KEY.get_secret_value())


@router.post("/login")
async def login(
    body: LoginRequest,
    auth: AuthCrudDep,
    redis: RedisDep,
    token_store: TokenStoreDep,
    user_agent: HeaderUserAgentDep,
) -> Response[TokenResponse]:
    """用户登录端点。"""
    token = await user_login(
        body.username,
        body.password,
        user_crud=auth,
        token_store=token_store,
        redis=redis,
        user_agent=user_agent,
    )
    return Response(data=token)


@router.post("/logout")
async def logout(auth: UserAccessJWTDep, token_store: TokenStoreDep, redis: RedisDep) -> Response[bool]:
    """登出当前用户。"""
    await token_store.revoke(auth.sub, auth.jti)
    await token_store.clear_user_cache(auth.sub)

    cache_mgr = get_service(PermissionCacheManager)
    await cache_mgr.invalidate(auth.sub, redis)

    logger.info("User {user_id} logged out", user_id=auth.sub)
    event_bus.fire_and_forget(UserLogoutEvent(user_id=str(auth.sub)))
    return Response(data=True)


@router.post("/token/refresh")
async def refresh_token(
    jwt_user: UserRefreshJWTDep,
    user: UserRefreshDep,
    redis: RedisDep,
    token_store: TokenStoreDep,
    user_agent: HeaderUserAgentDep,
) -> Response[TokenResponse]:
    """使用刷新令牌刷新用户的访问令牌。"""
    token = await refresh_user_token(jwt_user.jti, cast(UserProtocol, user), token_store, redis, user_agent)
    return Response(data=token)


@router.post("/login/swagger", include_in_schema=False, dependencies=[Depends(check_debug)])
async def login_swagger(
    form: OAuth2Form,
    auth: AuthCrudDep,
    redis: RedisDep,
    token_store: TokenStoreDep,
    user_agent: HeaderUserAgentDep,
) -> OAuth2TokenResponse:
    """通过 Swagger 登录验证用户并生成访问令牌。"""
    user_info = await auth.get_user_by_username(form.username)
    if not check_password(form.password, user_info.password):
        raise AppException(AuthStatusCode.AUTHENTICATION_FAILED)

    token = await token_store.issue(user_info.id, user_info.name, user_agent)
    cache_mgr = get_service(PermissionCacheManager)
    await cache_mgr.build(user_info.id, user_info.roles, redis)
    return OAuth2TokenResponse(access_token=token.access_token, token_type="bearer")


@router.get("/user/info")
async def get_user_info(user: UserDBDep, redis: RedisDep) -> Response[UserInfoResponse]:
    """检索当前的用户信息。"""
    user_data = UserInfoResponse.model_validate(user)

    if not user.is_admin:
        cache_mgr = get_service(PermissionCacheManager)
        user_data.buttons = await cache_mgr.get_buttons(user.id, user.roles, redis)

    return Response(data=user_data)
