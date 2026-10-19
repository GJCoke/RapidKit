"""
测试辅助：通过覆盖 ``access_guard_dependency`` 替换权限码判定。

用法::

    app.dependency_overrides[access_guard_dependency] = allow_access(user)
    app.dependency_overrides[access_guard_dependency] = deny_access()

Author : Coke
Date   : 2026-10-17
"""

from collections.abc import Callable
from typing import Any

from fastapi import HTTPException, Request

from rapidkit_common.access import AccessGuard, Scope
from rapidkit_common.auth import UserDBDep


def _scope(user: Any, code: str) -> Scope:
    return Scope(user=user, code=code)


def allow_access(user: Any) -> Callable[[], AccessGuard]:
    """依赖覆盖工厂：所有 ``Require`` 放行，并以 ``user`` 构造 ``Scope``。"""

    def dependency() -> AccessGuard:
        async def guard(code: str, request: Request) -> Scope:
            return _scope(user, code)

        return guard

    return dependency


def deny_access(status_code: int = 403) -> Callable[[], AccessGuard]:
    """依赖覆盖工厂：所有 ``Require`` 抛出 ``HTTPException(status_code)``。"""

    def dependency() -> AccessGuard:
        async def guard(code: str, request: Request) -> Scope:
            raise HTTPException(status_code=status_code)

        return guard

    return dependency


async def allow_current_user_access(user: UserDBDep) -> AccessGuard:
    """依赖覆盖：所有 ``Require`` 放行，用户仍经正常认证解析（整应用测试使用）。"""

    async def guard(code: str, request: Request) -> Scope:
        return _scope(user, code)

    return guard
