"""
Auth Deps.

This module provides JWT-based user authentication utilities
for FastAPI routes, including token parsing and user injection.

Author : Coke
Date   : 2025-04-17
"""

from authlib.jose.errors import ExpiredTokenError, JoseError
from fastapi import Depends, Header
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from typing_extensions import Annotated, Doc

from src.core.config import auth_settings, settings
from src.core.exceptions import AppException
from src.core.log import logger
from src.core.status_codes import StatusCode
from src.crud.auth import UserCRUD
from src.deps.database import RedisDep, SessionDep
from src.models.auth import User
from src.utils.security import AccessJWT, RefreshJWT, decode_token

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
    "refresh_structure",
    "oauth2_scheme",
]

oauth2_scheme = OAuth2PasswordBearer(tokenUrl=f"{settings.API_PREFIX_V1}/auth/login/swagger", auto_error=False)
refresh_structure = "auth:refresh:<{user_id}>:<{jti}>"

OAuth2Form = Annotated[
    OAuth2PasswordRequestForm,
    Depends(),
    Doc(
        """
        OAuth2 密码登录表单，包含用户名和密码字段。
        用于通过 OAuth2 密码模式认证用户。
        """
    ),
]


def get_access_token(token: Annotated[str, Depends(oauth2_scheme)]) -> str:
    """
    依赖项：从 Authorization 头部提取并校验 access token。

    Args:
        token: 从请求头获取的 JWT access token。

    Raises:
        UnauthorizedException: 未提供 token 或 token 无效时抛出。

    Returns:
        str: 提取到的 JWT access token。
    """
    if token is None:
        logger.debug("No token is provided.")
        raise AppException(StatusCode.TOKEN_INVALID)

    return token


def get_refresh_token(x_refresh_token: Annotated[str, Header(...)]) -> str:
    """
    依赖项：从 'x-refresh-token' 请求头提取 refresh token。

    Args:
        x_refresh_token: 自定义头部中的 refresh token。

    Raises:
        PermissionDeniedException: 缺少该头部时抛出。

    Returns:
        str: 提取到的 refresh token。
    """
    if x_refresh_token is None:
        logger.debug("No refresh token is provided.")
        raise AppException(StatusCode.TOKEN_REFRESH_FAILED)

    return x_refresh_token


def get_user_agent(user_agent: Annotated[str, Header(..., include_in_schema=False)]) -> str:
    """
    依赖项：从请求头提取 User-Agent。

    Args:
        user_agent: 请求头中的 User-Agent 字符串。

    Raises:
        BadRequestException: 缺少该头部时抛出。

    Returns:
        str: 提取到的 User-Agent 字符串。
    """
    if user_agent is None:
        logger.debug("No User-Agent is provided.")
        raise AppException(StatusCode.BAD_REQUEST)

    return user_agent


HeaderRefreshTokenDep = Annotated[
    str,
    Depends(get_refresh_token),
    Doc(
        """
        类型化依赖项：注入请求头中的 refresh token。
        用于刷新 JWT access token 及处理会话重新认证。
        """
    ),
]

HeaderUserAgentDep = Annotated[
    str,
    Depends(get_user_agent),
    Doc(
        """
        类型化依赖项：注入请求头中的 User-Agent。
        可用于追踪客户端环境或设备相关逻辑。
        """
    ),
]
HeaderAccessTokenDep = Annotated[
    str,
    Depends(get_access_token),
    Doc(
        """
        类型化依赖项：注入经过校验的 JWT access token。
        适用于需要认证的路由函数。
        """
    ),
]


def parse_access_jwt_user(token: HeaderAccessTokenDep) -> AccessJWT:
    """
    解析 JWT access token 并返回解码后的用户对象。

    Args:
        token: 通过请求头传递的 JWT access token。

    Returns:
        AccessJWT: 从 token 解码得到的用户信息。

    Raises:
        UnauthorizedException: token 无效或解码失败时抛出。
    """

    try:
        user = decode_token(token, auth_settings.ACCESS_TOKEN_KEY)
    except ExpiredTokenError:
        raise AppException(StatusCode.TOKEN_EXPIRED)
    except JoseError:
        raise AppException(StatusCode.TOKEN_INVALID)

    return user


def parse_refresh_jwt_user(
    x_refresh_token: HeaderRefreshTokenDep,
    user_agent: HeaderUserAgentDep,
) -> RefreshJWT:
    """
    解析 JWT refresh token 并返回解码后的用户对象。

    Args:
        x_refresh_token: 通过请求头传递的 JWT refresh token。
        user_agent: 请求头中的 user agent。

    Returns:
        RefreshJWT: 从 token 解码得到的用户信息。

    Raises:
        UnauthorizedException: token 无效或解码失败时抛出。
        BadRequestException: 设备信息不匹配时抛出。
    """

    try:
        user = decode_token(x_refresh_token, auth_settings.REFRESH_TOKEN_KEY)
    except ExpiredTokenError:
        raise AppException(StatusCode.TOKEN_EXPIRED)
    except JoseError:
        raise AppException(StatusCode.TOKEN_INVALID)

    if user.agent != user_agent:
        logger.warning(
            "User-Agent mismatch detected: original request User-Agent '%s'"
            " does not match refresh token User-Agent '%s'.",
            user_agent,
            user.agent,
        )
        raise AppException(StatusCode.BAD_REQUEST)

    return user


UserAccessJWTDep = Annotated[
    AccessJWT,
    Depends(parse_access_jwt_user),
    Doc(
        """
        依赖项：提供 access JWT token 解码后的用户信息。

        该依赖通过 parse_access_jwt_user 解码请求头中的 JWT access token，
        并将解码后的用户信息（UserAccessJWT 对象）注入路由。
        若 token 无效或解码失败会抛出 UnauthorizedException。

        解码后的 AccessJWT 包含用户身份及相关数据。
        """
    ),
]
UserRefreshJWTDep = Annotated[
    RefreshJWT,
    Depends(parse_refresh_jwt_user),
    Doc(
        """
        依赖项：提取并解码请求头中的 refresh JWT token。

        保证 refresh token 有效且请求设备与 token 中存储一致。
        若 token 无效或设备不匹配会抛出 PermissionDeniedException 或 BadRequestException。

        用于获取 refresh token 中存储的用户信息，
        通常用于刷新 access token 或校验用户会话。
        """
    ),
]


async def get_auth_crud(session: SessionDep) -> UserCRUD:
    """
    提供用于认证逻辑的 UserCRUD 实例。

    Args:
        session: 注入的数据库会话。

    Returns:
        UserCRUD: 初始化的用户操作 CRUD 实例。
    """
    return UserCRUD(User, session=session)


AuthCrudDep = Annotated[
    UserCRUD,
    Depends(get_auth_crud),
    Doc(
        """
        依赖项：提供用于用户认证操作的 UserCRUD 实例。
        通过 get_auth_crud 注入基于会话的 UserCRUD，
        用于用户查询和认证相关操作。
        """
    ),
]


async def get_current_user_form_db(user: UserAccessJWTDep, db_user: AuthCrudDep) -> User:
    """
    根据 JWT token 中的 user_id 查询数据库中的完整用户信息。

    Args:
        user: 解析 token 得到的 user_id。
        db_user: 用户操作的 CRUD 类。

    Returns:
        User: 数据库中查到的完整用户模型。

    Raises:
        UnauthorizedException: token 无效、解码失败或数据库无此用户时抛出。
    """
    user_info = await db_user.get(user.sub)
    if not user_info:
        logger.debug("No user found in the database.")
        raise AppException(StatusCode.USER_NOT_FOUND)

    if not user_info.status:
        logger.debug("User found but is inactive.")
        raise AppException(StatusCode.USER_DISABLED)
    return user_info


async def get_current_user_form_redis_and_db(user: UserRefreshJWTDep, db_user: AuthCrudDep, redis: RedisDep) -> User:
    """
    从 Redis 和数据库中获取当前用户。

    先检查 Redis 中是否存在有效的 refresh token，
    若未找到或数据库无此用户则抛出 PermissionDeniedException。

    Args:
        user: refresh token 解码得到的用户信息。
        db_user: 数据库用户操作依赖。
        redis: Redis 操作依赖。

    Returns:
        User: 数据库中查到的用户对象。

    Raises:
        PermissionDeniedException: refresh token 不存在或数据库无此用户时抛出。
    """
    refresh_token = redis.get(refresh_structure.format(user_id=user.sub, jti=user.jti))

    if not refresh_token:
        logger.debug("No refresh token found in the redis.")
        raise AppException(StatusCode.TOKEN_EXPIRED)

    user_info = await db_user.get(user.sub)
    if not user_info:
        logger.debug("No user found in the database.")
        raise AppException(StatusCode.USER_NOT_FOUND)

    return user_info


UserDBDep = Annotated[
    User,
    Depends(get_current_user_form_db),
    Doc(
        """
        依赖项：通过 get_current_user_form_db 查询数据库中的用户信息。
        用于需要直接从数据库获取用户数据的路由函数。
        """
    ),
]
UserRefreshDep = Annotated[
    User,
    Depends(get_current_user_form_redis_and_db),
    Doc(
        """
        依赖项：先检查 Redis 中是否存在 refresh token，
        若存在则从数据库获取对应用户数据。
        用于同时校验 refresh token 有效性和用户信息的场景。
        """
    ),
]
