"""
权限依赖抽象层。

插件通过此模块获取 verify_user_permission 和 UserDBDep，
实际实现由 auth 插件在启动时通过 FastAPI dependency_overrides 注入。

Author : Coke
Date   : 2026-04-14
"""

from typing import Protocol
from uuid import UUID

from fastapi import Depends
from fastapi.security import OAuth2PasswordBearer
from typing_extensions import Annotated, Doc


class UserProtocol(Protocol):
    """用户模型的最小接口协议，供类型检查使用。"""

    id: UUID
    is_admin: bool
    roles: list[str]
    department_id: UUID | None


_oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login/swagger", auto_error=False)


async def _verify_user_permission_placeholder(
    _token: str = Depends(_oauth2_scheme),
) -> UserProtocol:
    """占位：由 auth 插件在启动时替换为真实实现。"""
    raise RuntimeError(
        "verify_user_permission has not been initialized. "
        "Make sure the auth plugin is loaded and has registered its dependency override."
    )


async def _get_current_user_placeholder(
    _token: str = Depends(_oauth2_scheme),
) -> UserProtocol:
    """占位：由 auth 插件在启动时替换为真实实现。"""
    raise RuntimeError(
        "get_current_user has not been initialized. "
        "Make sure the auth plugin is loaded and has registered its dependency override."
    )


verify_user_permission = _verify_user_permission_placeholder

UserDBDep = Annotated[
    UserProtocol,
    Depends(_get_current_user_placeholder),
    Doc(
        """
        依赖项：获取当前登录用户的数据库模型。
        实际实现由 auth 插件注入。
        """
    ),
]

VerifyPermissionDep = Annotated[
    UserProtocol,
    Depends(_verify_user_permission_placeholder),
    Doc(
        """
        依赖项：校验当前用户是否有权限访问该路由。
        实际实现由 auth 插件注入。
        """
    ),
]
