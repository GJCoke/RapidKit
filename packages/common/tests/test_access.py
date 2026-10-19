"""接口访问声明测试。"""

from types import SimpleNamespace
from typing import Annotated

import pytest
from fastapi import APIRouter, Depends, FastAPI, Request
from fastapi.routing import APIRoute
from httpx import ASGITransport, AsyncClient
from rapidkit_common import access
from rapidkit_common.access import (
    Authenticated,
    Public,
    Require,
    RequireDependency,
    Scope,
    access_guard_dependency,
    inspect_route_access,
    set_access_resolver,
)
from rapidkit_common.auth import DenyImpersonation


def _routes(router: APIRouter) -> dict[str, APIRoute]:
    return {route.name: route for route in router.routes if isinstance(route, APIRoute)}


def _build_router() -> APIRouter:
    router = APIRouter()

    @router.get("/listed", dependencies=[Require("item:read")])
    async def listed() -> None:
        return None

    @router.get("/param")
    async def param(scope: Annotated[Scope, Require("item:read")]) -> None:
        return None

    @router.get("/authenticated", dependencies=[Authenticated])
    async def authenticated() -> None:
        return None

    @router.get("/public", dependencies=[Public])
    async def public() -> None:
        return None

    @router.get("/none")
    async def none() -> None:
        return None

    @router.get("/twice", dependencies=[Require("item:read"), Authenticated])
    async def twice() -> None:
        return None

    @router.post("/deny", dependencies=[Depends(DenyImpersonation), Authenticated])
    async def deny() -> None:
        return None

    return router


def test_require_wraps_code_in_dependency():
    dependency = Require("item:read").dependency
    assert isinstance(dependency, RequireDependency)
    assert dependency.code == "item:read"


def test_inspect_route_access_reports_each_declaration_kind():
    routes = _routes(_build_router())
    listed = inspect_route_access(routes["listed"])
    assert [(a.kind, a.code, a.scope_received) for a in listed] == [("require", "item:read", False)]
    param = inspect_route_access(routes["param"])
    assert [(a.kind, a.code, a.scope_received) for a in param] == [("require", "item:read", True)]
    assert [a.kind for a in inspect_route_access(routes["authenticated"])] == ["authenticated"]
    assert [a.kind for a in inspect_route_access(routes["public"])] == ["public"]
    assert inspect_route_access(routes["none"]) == []
    assert [a.kind for a in inspect_route_access(routes["twice"])] == ["require", "authenticated"]


def test_inspect_route_access_flags_deny_impersonation():
    routes = _routes(_build_router())
    assert [a.deny_impersonation for a in inspect_route_access(routes["deny"])] == [True]
    assert [a.deny_impersonation for a in inspect_route_access(routes["public"])] == [False]


@pytest.mark.asyncio
async def test_access_guard_without_resolver_raises():
    set_access_resolver(None)
    with pytest.raises(RuntimeError, match="Access resolver has not been initialized"):
        await access_guard_dependency(SimpleNamespace(), SimpleNamespace(), SimpleNamespace())


@pytest.mark.asyncio
async def test_access_guard_delegates_to_injected_resolver():
    calls = []

    async def resolver(code, request, user, redis, session):
        calls.append((code, request, user, redis, session))
        return Scope(user=user, code=code)

    user, redis, session, request = object(), object(), object(), object()
    set_access_resolver(resolver)
    try:
        guard = await access_guard_dependency(user, redis, session)
        scope = await guard("item:read", request)
    finally:
        set_access_resolver(None)
    assert calls == [("item:read", request, user, redis, session)]
    assert scope.code == "item:read"
    assert scope.user is user


@pytest.mark.asyncio
async def test_require_returns_scope_from_guard():
    app = FastAPI()
    seen = []

    @app.get("/items")
    async def items(scope: Annotated[Scope, Require("item:read")]) -> dict:
        return {"code": scope.code}

    def guard_dependency():
        async def guard(code: str, request: Request) -> Scope:
            seen.append(code)
            return Scope(user=SimpleNamespace(), code=code)

        return guard

    app.dependency_overrides[access_guard_dependency] = guard_dependency
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/items")
    assert response.json() == {"code": "item:read"}
    assert seen == ["item:read"]


def test_markers_are_distinct_callables():
    assert Authenticated.dependency is access.authenticated_dependency
    assert Public.dependency is access.public_dependency
