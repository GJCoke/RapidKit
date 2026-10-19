"""
路由访问声明自检：每个接口恰有一种声明、权限码存在、ABAC 资源接收 Scope。

Author : Coke
Date   : 2026-10-17
"""

from dataclasses import dataclass
from typing import Literal

from fastapi.routing import APIRoute
from rapidkit_common.access import RouteAccess, inspect_route_access
from starlette.routing import BaseRoute

from plugin_permission.catalog.registry import PermissionCatalog
from plugin_permission.utils import build_route_key


@dataclass(frozen=True)
class RouteIssue:
    """一条自检结果；权限码级别的问题 ``route_key`` 为 ``code:<权限码>``。"""

    level: Literal["error", "warning"]
    route_key: str
    message: str


def _api_routes(routes: list[BaseRoute]) -> list[APIRoute]:
    return [route for route in routes if isinstance(route, APIRoute)]


def _describe(access: RouteAccess) -> str:
    return f"require:{access.code}" if access.kind == "require" else str(access.kind)


def collect_route_bindings(routes: list[BaseRoute]) -> dict[str, str]:
    """路由键 → 声明码，仅收录恰有一条 ``Require`` 声明的路由。"""
    bindings: dict[str, str] = {}
    for route in _api_routes(routes):
        accesses = inspect_route_access(route)
        if len(accesses) == 1 and accesses[0].kind == "require" and accesses[0].code is not None:
            bindings[build_route_key(route.methods, route.path)] = accesses[0].code
    return bindings


def check_routes(routes: list[BaseRoute], catalog: PermissionCatalog) -> list[RouteIssue]:
    """
    自检全部 API 路由。

    Args:
        routes: ``app.routes``。
        catalog: 已构建的目录。

    Returns:
        自检结果；``error`` 应使启动失败，``warning`` 写日志。
    """
    issues: list[RouteIssue] = []
    for route in _api_routes(routes):
        route_key = build_route_key(route.methods, route.path)
        accesses = inspect_route_access(route)
        if not accesses:
            issues.append(
                RouteIssue("error", route_key, "Route has no access declaration; use Require, Authenticated or Public")
            )
            continue
        if len(accesses) > 1:
            described = ", ".join(_describe(access) for access in accesses)
            issues.append(RouteIssue("error", route_key, f"Route has multiple access declarations: {described}"))
            continue
        access = accesses[0]
        if access.kind != "require" or access.code is None:
            continue
        if access.code not in catalog.codes:
            issues.append(RouteIssue("error", route_key, f"Unknown permission code '{access.code}'"))
            continue

    bound = catalog.bound_codes()
    for code in sorted(set(catalog.codes) - bound):
        issues.append(RouteIssue("warning", f"code:{code}", f"Permission code '{code}' is not bound to any route"))
    return issues
