import json
from types import SimpleNamespace as NS
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from fastapi.routing import APIRoute
from plugin_permission.cache import CachedPermissions, RoleSnapshot
from plugin_permission.catalog.registry import PermissionCatalog
from plugins.permission.tests.catalog_fixtures import make_catalog, make_scoped_catalog
from rapidkit_common.scope_runtime import get_session_scope, set_field_rules
from rapidkit_framework.exceptions import AppException
from sqlmodel.ext.asyncio.session import AsyncSession
from tests.testing.utils import one_event


async def test_permission_denial_once(monkeypatch, json_log):
    from plugin_permission import access

    uid = uuid4()
    catalog = make_catalog()

    async def endpoint():
        pass

    request = NS(scope={"route": APIRoute("/api/v1/users/{user_id}", endpoint, methods=["DELETE"])})
    monkeypatch.setattr(access, "get_catalog", lambda: catalog)
    monkeypatch.setattr(
        access,
        "get_fresh_permissions",
        AsyncMock(
            return_value=(CachedPermissions(codes=[], role_versions={"editor": 4}, catalog_version=9), {"editor": 4})
        ),
    )
    with pytest.raises(AppException):
        await access.resolve_access(
            "user:delete", request, NS(id=uid, is_admin=False, roles=["editor"], username="private-name"), None, None
        )
    row = one_event(json_log(), "permission.access.rejected")
    assert (row["level"], row["outcome"], row["reason_code"], row["user_id"], row["plugin"]) == (
        "WARNING",
        "rejected",
        "permission_denied",
        str(uid),
        "RBACaudit",
    )
    assert len([r for r in json_log() if r["level"] == "WARNING"]) == 1
    assert "role_versions" not in row["message"] and "catalog_version" not in row["message"]
    assert "private-" not in str(json_log())


@pytest.mark.parametrize("department", [False, True])
async def test_department_scope_unavailable(department, monkeypatch, json_log):
    from plugin_permission import scope_binding

    uid = uuid4()
    monkeypatch.setattr(scope_binding, "get_service_optional", lambda _: None)
    assert await scope_binding.load_dept_subtree(NS(id=uid, department_id=uuid4() if department else None)) == ()
    row = one_event(json_log(), "permission.scope.degraded" if department else "permission.scope.filtered")
    assert (row["level"], row["outcome"], row["reason_code"], row["user_id"]) == (
        "WARNING" if department else "DEBUG",
        "degraded" if department else "filtered",
        "dept_resolver_unavailable" if department else "user_without_department",
        str(uid),
    )
    assert "private-" not in str(json_log())


@pytest.mark.parametrize("restricted", [False, True])
async def test_scope_logs_debug_without_url(restricted, json_log):
    from plugin_permission.scope_binding import bind_request_scope

    uid = uuid4()
    session = AsyncSession()
    cached = CachedPermissions(codes=["item:read"], data_scopes={"item": ["self"]} if restricted else {})
    await bind_request_scope(
        code="item:read",
        user=NS(id=uid, department_id=None),
        request=NS(method="GET", url=NS(path="/private-resource/123?token=private-query")),
        session=session,
        catalog=make_scoped_catalog(),
        cached=cached,
    )
    assert (get_session_scope(session) is not None) == restricted
    row = one_event(json_log(), "permission.scope.filtered" if restricted else "permission.scope.unrestricted")
    assert (row["level"], row["reason_code"], row["user_id"]) == (
        "DEBUG",
        "scope_restricted" if restricted else "scope_unrestricted",
        str(uid),
    )
    assert not [r for r in json_log() if r["level"] == "INFO"]
    assert "private-" not in str(json_log())
    set_field_rules({})
    await session.close()


async def test_missing_role_snapshot(json_log):
    from plugin_permission.role_snapshots import _load_snapshot

    raw = await _load_snapshot(NS(get_role_by_codes=AsyncMock(return_value=[])), "editor")
    assert json.loads(raw)["active"] is False
    row = one_event(json_log(), "permission.role.degraded")
    assert (row["level"], row["outcome"], row["reason_code"], row["resource_type"], row["resource_id"]) == (
        "WARNING",
        "degraded",
        "role_not_found",
        "role",
        "editor",
    )
    assert "private-" not in str(json_log())


async def test_stale_role_config_summary(monkeypatch, json_log):
    from plugin_permission import adapters

    snapshot = RoleSnapshot(
        code="editor",
        active=True,
        data_scopes={"private-resource": "old"},
        field_modes={"private-resource": {"private-group": "masked"}},
    )
    monkeypatch.setattr(adapters, "get_permission_versions", AsyncMock(return_value=({"editor": 1}, 1)))
    monkeypatch.setattr(adapters, "load_role_snapshots", AsyncMock(return_value=[snapshot]))
    monkeypatch.setattr(adapters, "get_catalog", lambda: PermissionCatalog({}, {}, {}))
    resolved = await adapters.AuthRoleResolver(None, None).resolve(["editor"])
    assert resolved.data_scopes == {} and resolved.field_modes == {}
    rows = [r for r in json_log() if r.get("event") == "permission.role.degraded"]
    assert len(rows) == 2
    for reason in ["stale_data_scope", "stale_field_group"]:
        row = one_event([r for r in rows if r["reason_code"] == reason], "permission.role.degraded")
        assert (row["level"], row["outcome"], row["resource_type"], row["resource_id"], row["filtered_count"]) == (
            "WARNING",
            "degraded",
            "role",
            "editor",
            1,
        )
    assert "private-" not in str(json_log())


def test_unknown_permission_summary(json_log):
    assert PermissionCatalog({}, {}, {}).expand(["private-code-a", "private-code-b"]) == set()
    row = one_event(json_log(), "permission.catalog.degraded")
    assert (row["level"], row["outcome"], row["reason_code"], row["filtered_count"]) == (
        "WARNING",
        "degraded",
        "unknown_permission_code_ignored",
        2,
    )
    assert "private-" not in str(json_log())


async def test_catalog_noop(monkeypatch, json_log):
    from plugin_permission.catalog import version

    monkeypatch.setattr(version, "get_versions", AsyncMock(return_value=[7]))
    assert await version.sync_catalog_version(NS(get=AsyncMock(return_value="private-digest")), "private-digest") == 7
    row = one_event(json_log(), "permission.catalog.noop")
    assert (row["level"], row["outcome"], row["reason_code"]) == ("INFO", "noop", "catalog_unchanged")
    assert "private-" not in str(json_log())
