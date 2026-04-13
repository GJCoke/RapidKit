"""
Auth Api.

Author : Coke
Date   : 2025-03-11
"""

from fastapi import APIRouter, Depends

from src.common.deps import RedisDep, check_debug
from src.common.schemas.response import Response
from src.core.config import auth_settings
from src.domains.auth.deps import (
    AuthCrudDep,
    HeaderUserAgentDep,
    OAuth2Form,
    UserAccessJWTDep,
    UserDBDep,
    UserRefreshDep,
    UserRefreshJWTDep,
    refresh_structure,
)
from src.domains.auth.schemas import (
    LoginRequest,
    OAuth2TokenResponse,
    TokenResponse,
    UserInfoResponse,
)
from src.domains.auth.services import create_access_token, refresh_user_token, user_login
from src.domains.role.deps import RoleCrudDep, permission_structure
from src.utils.security import AccessJWT
from src.utils.uuid7 import uuid8

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
    """
    用户登录端点。

    该端点验证用户的凭证，解密密码，需验证数据库，并在成功时返回访问令牌和刷新令牌。\f

    Args:
        body: 登录请求轻载，一含用户名和加密密码。
        auth: 依赖注入的认证 CRUD 逻辑。
        role: 依赖注入的权限 CRUD 逻辑。
        redis: Redis 客户端依赖。
        user_agent: User-Agent 请求对象。

    Returns:
        一个标准化响应，不含访问令牌和刷新令牌。
    """
    token = await user_login(
        body.username,
        body.password,
        user_crud=auth,
        role_crud=role,
        redis=redis,
        user_agent=user_agent,
    )

    from src.domains.system.services import ActivityService

    ActivityService.log_activity_fire_and_forget(event_type="user_login", params={"name": body.username})

    return Response(data=token)


@router.post("/logout")
async def logout(auth: UserAccessJWTDep, redis: RedisDep) -> Response[bool]:
    """
    登出当前用户。\f

    Args:
        auth: 下需验证的访问令牌，包含用户的身份和元数据。
        redis: Redis 客户端依赖，用于与 Redis 数据库交互。

    Returns:
        一个响应，指示登出是否成功。
    """
    token = refresh_structure.format(user_id=auth.sub, jti=auth.jti)
    if await redis.exists(token):
        await redis.delete(token)

    permission_key = permission_structure.format(user_id=auth.sub)
    if await redis.exists(permission_key):
        await redis.delete(permission_key)

    return Response(data=True)


@router.post("/token/refresh")
async def refresh_token(
    jwt_user: UserRefreshJWTDep,
    user: UserRefreshDep,
    role: RoleCrudDep,
    redis: RedisDep,
    user_agent: HeaderUserAgentDep,
) -> Response[TokenResponse]:
    """
    使用刷新令牌刷新用户的访问令牌。\f

    Args:
        jwt_user: 刷新令牌用户信息。
        user: 使用刷新令牌检索的解码用户数据。
        role: 依赖注入的权限 CRUD 逻辑。
        redis: Redis 客户端依赖，用于与 Redis 数据库交互。
        user_agent: 请求中的 user-agent 标头，用于验证请求。

    Returns:
        一个响应，不含新的访问令牌和刷新令牌。

    Raises:
        PermissionDeniedException: 刷新令牌无效时。
        BadRequestException: 当 user-agent 不匹配時。
    """
    token = await refresh_user_token(jwt_user.jti, user, role, redis, user_agent)
    return Response(data=token)


@router.post("/login/swagger", include_in_schema=False, dependencies=[Depends(check_debug)])
async def login_swagger(form: OAuth2Form, auth: AuthCrudDep) -> OAuth2TokenResponse:
    """
    通过 Swagger 登录验证用户并生成访问令牌。

    该端点采用于开发或测试环境
    且決不会出现在公共 API 文档中。\f

    Args:
        form: 登录表单，不含用户名和密码。
        auth: 依赖，为身份验证 CRUD 逻辑提供访问。

    Returns:
        已生成的访问令牌和令牌类型。
    """
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
    """
    检索当前的用户信息。

    该端点在验证令牌和从数据库检索了完整记录后需出有详细信息。\f

    Args:
        user: 依赖，从数据库解析当前用户。
        redis: Redis 依赖。
        role_crud: 角色 CRUD 依赖。

    Returns:
        一个标准化响应，不含用户详情。
    """
    from src.domains.role.deps import get_user_permission_cache

    user_data = UserInfoResponse.model_validate(user)

    if not user.is_admin:
        cache = await get_user_permission_cache(user, redis, role_crud)
        user_data.buttons = cache.buttons

    return Response(data=user_data)
