"""
接口访问声明。

每个接口必须且只能声明以下之一：

- ``Require("资源:动作")``：需持有该权限码，可作为参数依赖拿到 ``Scope``；
- ``Authenticated``：登录即可，不检查权限码，不经过 ABAC；
- ``Public``：无需登录。

权限码判定由 permission 插件通过 ``set_access_resolver()`` 注入。
测试可覆盖 ``access_guard_dependency``（见 ``rapidkit_common.access_testing``）。

Author : Coke
Date   : 2026-10-17
"""

from collections.abc import Awaitable, Callable, Iterator
from dataclasses import dataclass
from typing import Any, Literal

from fastapi import Depends, Request, params
from fastapi.dependencies.models import Dependant
from fastapi.routing import APIRoute
from rapidkit_core.redis_client import AsyncRedisClient
from sqlmodel.ext.asyncio.session import AsyncSession
from typing_extensions import Annotated, Doc

from rapidkit_common.auth import DenyImpersonation, UserDBDep, UserProtocol
from rapidkit_common.deps import RedisDep, SessionDep
from rapidkit_common.scope_runtime import apply_field_rules


@dataclass(frozen=True)
class Scope:
    """
    一次授权判定的结果。

    数据范围与字段规则由访问解析器绑定到请求会话与序列化上下文，接口代码无需处理；
    仅在手工构造、不经过 ORM 对象的响应数据时使用 ``serialize``。

    Attributes:
        user: 当前用户。
        code: 本次校验的权限码。
    """

    user: UserProtocol
    code: str

    def serialize(self, data: dict[str, Any], model: type) -> dict[str, Any]:
        """按当前请求的字段规则处理一条来自 ``model`` 的手工构造数据。"""
        return apply_field_rules(data, model)


AccessResolver = Callable[[str, Request, UserProtocol, AsyncRedisClient, AsyncSession], Awaitable[Scope]]
AccessGuard = Callable[[str, Request], Awaitable[Scope]]

_resolver: AccessResolver | None = None


def set_access_resolver(resolver: AccessResolver | None) -> None:
    """由 permission 插件调用，注入真实的权限码判定。"""
    global _resolver
    _resolver = resolver


async def access_guard_dependency(user: UserDBDep, redis: RedisDep, session: SessionDep) -> AccessGuard:
    """把当前请求的用户、Redis、会话绑定到已注入的 resolver。"""
    resolver = _resolver
    if resolver is None:
        raise RuntimeError("Access resolver has not been initialized. Make sure the permission plugin is loaded.")

    async def guard(code: str, request: Request) -> Scope:
        return await resolver(code, request, user, redis, session)

    return guard


AccessGuardDep = Annotated[
    AccessGuard,
    Depends(access_guard_dependency),
    Doc("依赖项：绑定当前请求的权限码判定函数。"),
]


class RequireDependency:
    """``Require(code)`` 背后的可调用依赖，``code`` 供路由自检读取。"""

    def __init__(self, code: str) -> None:
        self.code = code

    async def __call__(self, request: Request, guard: AccessGuardDep) -> Scope:
        return await guard(self.code, request)

    def __repr__(self) -> str:
        return f"Require({self.code!r})"


def Require(code: str) -> params.Depends:
    """声明接口需要的权限码；可放入 ``dependencies=[...]`` 或 ``Annotated[Scope, Require(...)]``。"""
    return Depends(RequireDependency(code))


async def authenticated_dependency(user: UserDBDep) -> UserProtocol:
    """``Authenticated`` 标记：解析当前登录用户。"""
    return user


async def public_dependency() -> None:
    """``Public`` 标记：不做任何校验。"""
    return None


Authenticated = Depends(authenticated_dependency)
Public = Depends(public_dependency)


@dataclass(frozen=True)
class RouteAccess:
    """路由上的一条访问声明。"""

    kind: Literal["require", "authenticated", "public"] | None
    code: str | None
    scope_received: bool
    deny_impersonation: bool


def _walk(dependant: Dependant, depth: int) -> Iterator[tuple[Dependant, int]]:
    for sub in dependant.dependencies:
        yield sub, depth
        yield from _walk(sub, depth + 1)


def inspect_route_access(route: APIRoute) -> list[RouteAccess]:
    """返回路由上的全部访问声明；``scope_received`` 表示端点以参数形式接收了 ``Scope``。"""
    nodes = list(_walk(route.dependant, 0))
    deny = any(node.call is DenyImpersonation for node, _ in nodes)
    result: list[RouteAccess] = []
    for node, depth in nodes:
        call = node.call
        if isinstance(call, RequireDependency):
            received = depth == 0 and node.name is not None
            result.append(RouteAccess(kind="require", code=call.code, scope_received=received, deny_impersonation=deny))
        elif call is authenticated_dependency:
            result.append(RouteAccess(kind="authenticated", code=None, scope_received=False, deny_impersonation=deny))
        elif call is public_dependency:
            result.append(RouteAccess(kind="public", code=None, scope_received=False, deny_impersonation=deny))
    return result


def has_route_access(request: Request, route_key: str) -> bool:
    """
    业务代码内的二次授权检查：当前请求用户能否访问 ``route_key`` 对应的接口。

    依赖访问解析器写入的 ``request.state.permission_ctx``；管理员不会写入该上下文，
    调用方需先自行判断 ``user.is_admin``。

    Args:
        request: 当前请求。
        route_key: ``METHOD:/api/v1/...`` 形式的接口 key。

    Returns:
        是否允许。
    """
    context = getattr(request.state, "permission_ctx", None)
    allows = getattr(context, "allows_route", None)
    return bool(allows is not None and allows(route_key))
