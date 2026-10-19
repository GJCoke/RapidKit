"""
测试辅助：汇总路由的访问声明，便于逐插件断言。

标签：``require:<码>`` / ``authenticated`` / ``public`` / ``none``；
多条声明以 ``|`` 连接；带 ``DenyImpersonation`` 时追加 ``+deny-impersonation``。
"""

from fastapi import APIRouter, FastAPI
from fastapi.routing import APIRoute
from plugin_permission.utils import build_route_key
from rapidkit_common.access import inspect_route_access


def declared_access(*routers: APIRouter, prefix: str = "/api/v1") -> dict[str, str]:
    """返回 ``路由键 → 声明标签``，路由键与运行时一致（含 ``/api/v1`` 前缀）。"""
    app = FastAPI()
    for router in routers:
        app.include_router(router, prefix=prefix)
    result: dict[str, str] = {}
    for route in app.routes:
        if not isinstance(route, APIRoute):
            continue
        accesses = inspect_route_access(route)
        if not accesses:
            label = "none"
        else:
            label = "|".join(f"require:{a.code}" if a.kind == "require" else str(a.kind) for a in accesses)
            if accesses[0].deny_impersonation:
                label += "+deny-impersonation"
        result[build_route_key(route.methods, route.path)] = label
    return result
