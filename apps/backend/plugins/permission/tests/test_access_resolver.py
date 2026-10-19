# apps/backend/plugins/permission/tests/test_access_resolver.py
"""访问解析器：按权限码授权。"""

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
from uuid import UUID

import pytest
from fastapi.routing import APIRoute
from rapidkit_framework.exceptions import AppException

from plugin_permission import access
from plugin_permission.cache import CachedPermissions
from plugin_permission.status_codes import RbacStatusCode
from plugins.permission.tests.catalog_fixtures import install_catalog

USER = SimpleNamespace(id=UUID("00000000-0000-0000-0000-0000000000aa"), is_admin=False, roles=["editor"])


async def _endpoint() -> None: ...


def _request(method: str, path: str):
    route = APIRoute(path, _endpoint, methods=[method])
    return SimpleNamespace(scope={"route": route}, state=SimpleNamespace(), method=method, url=SimpleNamespace(path=path))


def _codes(monkeypatch, codes):
    monkeypatch.setattr(access, "ensure_catalog_fresh", AsyncMock())
    monkeypatch.setattr(access, "record_denial", AsyncMock())
    cached = CachedPermissions(codes=codes, role_versions={"editor": 1}, catalog_version=1)
    monkeypatch.setattr(access, "get_fresh_permissions", AsyncMock(return_value=(cached, {"editor": 1})))


async def test_holding_declared_code_allows_and_sets_context(monkeypatch):
    install_catalog()
    _codes(monkeypatch, ["user:read"])
    request = _request("GET", "/api/v1/users")

    scope = await access.resolve_access("user:read", request, USER, object(), object())

    assert scope.code == "user:read"
    assert request.state.permission_ctx.codes == ["user:read"]


async def test_missing_code_raises_with_detail(monkeypatch):
    install_catalog()
    _codes(monkeypatch, ["user:read"])
    request = _request("DELETE", "/api/v1/users/{user_id}")

    with pytest.raises(AppException) as error:
        await access.resolve_access("user:delete", request, USER, object(), object())

    assert error.value.code == RbacStatusCode.ROLE_PERMISSION_DENIED.code
    assert error.value.data == {
        "code": "user:delete",
        "label": "删除用户",
        "resource": "user",
        "resourceLabel": "用户",
    }


async def test_route_not_in_catalog_falls_back_to_declared_code(monkeypatch):
    install_catalog()
    _codes(monkeypatch, ["user:read"])
    request = _request("GET", "/api/v1/test/added-after-startup")

    scope = await access.resolve_access("user:read", request, USER, object(), object())

    assert scope.code == "user:read"


async def test_admin_bypasses(monkeypatch):
    refresh = AsyncMock()
    monkeypatch.setattr(access, "ensure_catalog_fresh", refresh)
    install_catalog()
    fresh = AsyncMock()
    monkeypatch.setattr(access, "get_fresh_permissions", fresh)
    admin = SimpleNamespace(id=USER.id, is_admin=True, roles=[])

    redis, session = object(), object()
    scope = await access.resolve_access("user:delete", _request("DELETE", "/x"), admin, redis, session)

    assert scope.code == "user:delete"
    fresh.assert_not_awaited()
    refresh.assert_awaited_once_with(redis, session)


@pytest.mark.parametrize("admin", [False, True])
async def test_success_binds_request_scope_only_for_non_admin(monkeypatch, admin):
    install_catalog()
    _codes(monkeypatch, ["user:read"])
    bind = AsyncMock()
    clear = MagicMock()
    monkeypatch.setattr(access, "bind_request_scope", bind)
    monkeypatch.setattr(access, "clear_request_scope", clear)
    user = SimpleNamespace(id=USER.id, is_admin=admin, roles=["editor"])
    request = _request("GET", "/api/v1/users")
    session = object()

    scope = await access.resolve_access("user:read", request, user, object(), session)

    assert (scope.user, scope.code) == (user, "user:read")
    if admin:
        bind.assert_not_awaited()
        clear.assert_called_once_with()
    else:
        bind.assert_awaited_once()
        assert bind.await_args.kwargs["session"] is session
        assert bind.await_args.kwargs["code"] == "user:read"
