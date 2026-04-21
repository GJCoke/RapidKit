"""
Auth Api.

Author : Coke
Date   : 2025-03-11
"""

from fastapi import APIRouter, Depends
from rapidkit_common.deps import RedisDep, check_debug
from rapidkit_common.schemas.response import Response
from rapidkit_core.auth_config import auth_settings
from rapidkit_core.exceptions import AppException
from rapidkit_core.log import get_plugin_logger
from rapidkit_core.security import check_password
from rapidkit_core.status_codes import StatusCode

from plugin_auth.auth.deps import (
    AuthCrudDep,
    HeaderUserAgentDep,
    OAuth2Form,
    UserAccessJWTDep,
    UserDBDep,
    UserRefreshDep,
    UserRefreshJWTDep,
    refresh_structure,
    user_structure,
)
from plugin_auth.auth.schemas import (
    LoginRequest,
    OAuth2TokenResponse,
    TokenResponse,
    UserInfoResponse,
)
from plugin_auth.auth.services import create_user_token, refresh_user_token, user_login
from plugin_auth.role.deps import (
    RoleCrudDep,
    create_user_permission_cache,
    get_user_permission_cache,
    permission_structure,
)

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

    user_cache_key = user_structure.format(user_id=auth.sub)
    if await redis.exists(user_cache_key):
        await redis.delete(user_cache_key)

    logger.info("User {user_id} logged out", user_id=auth.sub)
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
async def login_swagger(
    form: OAuth2Form,
    auth: AuthCrudDep,
    role: RoleCrudDep,
    redis: RedisDep,
    user_agent: HeaderUserAgentDep,
) -> OAuth2TokenResponse:
    """通过 Swagger 登录验证用户并生成访问令牌。"""
    user_info = await auth.get_user_by_username(form.username)
    if not check_password(form.password, user_info.password):
        raise AppException(StatusCode.AUTHENTICATION_FAILED)

    token = await create_user_token(user_info.id, user_info.name, redis, user_agent)
    await create_user_permission_cache(user_info.id, user_info.roles, redis, role)
    return OAuth2TokenResponse(access_token=token.access_token, token_type="bearer")


@router.get("/user/info")
async def get_user_info(user: UserDBDep, redis: RedisDep, role_crud: RoleCrudDep) -> Response[UserInfoResponse]:
    """检索当前的用户信息。"""
    user_data = UserInfoResponse.model_validate(user)

    if not user.is_admin:
        cache = await get_user_permission_cache(user, redis, role_crud)
        user_data.buttons = cache.buttons

    return Response(data=user_data)
