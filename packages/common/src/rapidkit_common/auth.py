"""
权限依赖抽象层。

插件通过此模块获取 verify_user_permission 和 UserDBDep，
实际实现由 auth 插件在启动时通过 FastAPI dependency_overrides 注入。

Author : Coke
Date   : 2026-04-14
"""

from typing import Any

from fastapi import Depends
from typing_extensions import Annotated, Doc


async def _verify_user_permission_placeholder() -> Any:
    """占位：由 auth 插件在启动时替换为真实实现。"""
    raise RuntimeError(
        "verify_user_permission has not been initialized. "
        "Make sure the auth plugin is loaded and has registered its dependency override."
    )


async def _get_current_user_placeholder() -> Any:
    """占位：由 auth 插件在启动时替换为真实实现。"""
    raise RuntimeError(
        "get_current_user has not been initialized. "
        "Make sure the auth plugin is loaded and has registered its dependency override."
    )


verify_user_permission = _verify_user_permission_placeholder

UserDBDep = Annotated[
    Any,
    Depends(_get_current_user_placeholder),
    Doc(
        """
        依赖项：获取当前登录用户的数据库模型。
        实际实现由 auth 插件注入。
        """
    ),
]

VerifyPermissionDep = Annotated[
    Any,
    Depends(_verify_user_permission_placeholder),
    Doc(
        """
        依赖项：校验当前用户是否有权限访问该路由。
        实际实现由 auth 插件注入。
        """
    ),
]
