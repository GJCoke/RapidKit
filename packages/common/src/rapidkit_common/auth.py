"""
认证依赖抽象层。

插件通过此模块获取 UserDBDep 与 DenyImpersonation，
实际实现由 auth 插件在启动时通过 FastAPI dependency_overrides 注入。
接口权限声明见 ``rapidkit_common.access``。

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


async def _get_current_user_placeholder(
    _token: str = Depends(_oauth2_scheme),
) -> UserProtocol:
    """占位：由 auth 插件在启动时替换为真实实现。"""
    raise RuntimeError(
        "get_current_user has not been initialized. "
        "Make sure the auth plugin is loaded and has registered its dependency override."
    )


UserDBDep = Annotated[
    UserProtocol,
    Depends(_get_current_user_placeholder),
    Doc(
        """
        依赖项：获取当前登录用户的认证信息。
        实际实现由 auth 插件注入。
        """
    ),
]


async def DenyImpersonation() -> None:
    """Credential-route marker implemented by the auth plugin at startup."""
    raise RuntimeError(
        "DenyImpersonation has not been initialized. Make sure the auth plugin has registered its dependency override."
    )
