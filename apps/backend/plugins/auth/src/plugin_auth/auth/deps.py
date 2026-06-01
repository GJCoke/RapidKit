"""
Auth Deps.

Author : Coke
Date   : 2025-04-17
"""

from authlib.jose.errors import ExpiredTokenError, JoseError
from fastapi import Depends, Header
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from plugin_user.models import User
from rapidkit_common.deps import RedisDep, SessionDep
from rapidkit_core.config import settings
from rapidkit_core.log import get_plugin_logger
from rapidkit_framework.context import ctx
from rapidkit_framework.exceptions import AppException
from rapidkit_framework.status_codes import StatusCode
from rapidkit_security import AccessJWT, RefreshJWT, decode_token
from typing_extensions import Annotated, Doc

from plugin_auth.auth.crud import UserCRUD
from plugin_auth.auth.token_store import TokenStore
from plugin_auth.auth_config import auth_settings
from plugin_auth.status_codes import AuthStatusCode

logger = get_plugin_logger("Auth")

__all__ = [
    "OAuth2Form",
    "HeaderRefreshTokenDep",
    "HeaderAccessTokenDep",
    "HeaderUserAgentDep",
    "UserRefreshDep",
    "UserRefreshJWTDep",
    "UserAccessJWTDep",
    "UserDBDep",
    "AuthCrudDep",
    "TokenStoreDep",
    "refresh_structure",
    "user_structure",
    "force_relogin_structure",
    "oauth2_scheme",
]

oauth2_scheme = OAuth2PasswordBearer(tokenUrl=f"{settings.API_PREFIX_V1}/auth/login/swagger", auto_error=False)
refresh_structure = "auth:refresh:<{user_id}>:<{jti}>"
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

OAuth2Form = Annotated[
    OAuth2PasswordRequestForm,
    Depends(),
    Doc("OAuth2 密码登录表单。"),
]


def get_access_token(token: Annotated[str, Depends(oauth2_scheme)]) -> str:
    if token is None:
        logger.debug("No token is provided.")
        raise AppException(AuthStatusCode.TOKEN_INVALID)
    return token


def get_refresh_token(x_refresh_token: Annotated[str, Header(...)]) -> str:
    if x_refresh_token is None:
        logger.debug("No refresh token is provided.")
        raise AppException(AuthStatusCode.TOKEN_REFRESH_FAILED)
    return x_refresh_token


def get_user_agent(user_agent: Annotated[str, Header(..., include_in_schema=False)]) -> str:
    if user_agent is None:
        logger.debug("No User-Agent is provided.")
        raise AppException(StatusCode.BAD_REQUEST)
    return user_agent


HeaderRefreshTokenDep = Annotated[str, Depends(get_refresh_token), Doc("Refresh token header.")]
HeaderUserAgentDep = Annotated[str, Depends(get_user_agent), Doc("User-Agent header.")]
HeaderAccessTokenDep = Annotated[str, Depends(get_access_token), Doc("Access token header.")]


async def parse_access_jwt_user(token: HeaderAccessTokenDep, redis: RedisDep) -> AccessJWT:
    try:
        user = decode_token(token, auth_settings.ACCESS_TOKEN_KEY)
    except ExpiredTokenError:
        raise AppException(AuthStatusCode.TOKEN_EXPIRED)
    except JoseError:
        raise AppException(AuthStatusCode.TOKEN_INVALID)

    relogin_key = force_relogin_structure.format(user_id=user.sub)
    if await redis.exists(relogin_key):
        raise AppException(AuthStatusCode.TOKEN_INVALID)

    ctx.user_id = user.sub
    return user


def parse_refresh_jwt_user(
    x_refresh_token: HeaderRefreshTokenDep,
    user_agent: HeaderUserAgentDep,
) -> RefreshJWT:
    try:
        user = decode_token(x_refresh_token, auth_settings.REFRESH_TOKEN_KEY)
    except ExpiredTokenError:
        raise AppException(AuthStatusCode.TOKEN_EXPIRED)
    except JoseError:
        raise AppException(AuthStatusCode.TOKEN_INVALID)

    if user.agent != user_agent:
        logger.warning(
            "User-Agent mismatch detected: original request User-Agent '{request_agent}'"
            " does not match refresh token User-Agent '{token_agent}', user_id={user_id}.",
            request_agent=user_agent,
            token_agent=user.agent,
            user_id=user.sub,
        )
    return user


UserAccessJWTDep = Annotated[AccessJWT, Depends(parse_access_jwt_user), Doc("Access JWT payload.")]
UserRefreshJWTDep = Annotated[RefreshJWT, Depends(parse_refresh_jwt_user), Doc("Refresh JWT payload.")]


async def get_auth_crud(session: SessionDep) -> UserCRUD:
    return UserCRUD(session)


AuthCrudDep = Annotated[UserCRUD, Depends(get_auth_crud), Doc("Auth CRUD instance.")]


async def get_current_user_form_db(user: UserAccessJWTDep, db_user: AuthCrudDep, redis: RedisDep) -> User:
    cache_key = user_structure.format(user_id=user.sub)
    cached = await redis.get(cache_key)
    if cached:
        user_info = User.model_validate_json(cached)
    else:
        user_info = await db_user.get(user.sub)
        if not user_info:
            logger.debug("No user found in the database.")
            raise AppException(AuthStatusCode.USER_NOT_FOUND)
        await redis.set(
            cache_key,
            user_info.model_dump_json(include=USER_CACHE_FIELDS),
            ex=auth_settings.ACCESS_TOKEN_EXP,
        )

    if not user_info.status:
        logger.debug("User found but is inactive.")
        raise AppException(AuthStatusCode.USER_DISABLED)
    return user_info


async def get_current_user_form_redis_and_db(user: UserRefreshJWTDep, db_user: AuthCrudDep, redis: RedisDep) -> User:
    refresh_token = await redis.get(refresh_structure.format(user_id=user.sub, jti=user.jti))
    if not refresh_token:
        logger.debug("No refresh token found in the redis.")
        raise AppException(AuthStatusCode.TOKEN_EXPIRED)
    user_info = await db_user.get(user.sub)
    if not user_info:
        logger.debug("No user found in the database.")
        raise AppException(AuthStatusCode.USER_NOT_FOUND)
    return user_info


UserDBDep = Annotated[User, Depends(get_current_user_form_db), Doc("Current user from DB.")]
UserRefreshDep = Annotated[User, Depends(get_current_user_form_redis_and_db), Doc("User via refresh token.")]


async def get_token_store(redis: RedisDep) -> TokenStore:
    return TokenStore(redis)


TokenStoreDep = Annotated[TokenStore, Depends(get_token_store), Doc("Token lifecycle manager.")]
