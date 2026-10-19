"""扩展服务测试。"""

from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import UUID

import pytest
from rapidkit_framework.exceptions import AppException
from rapidkit_framework.plugin import PermissionCodeDef, PluginManifest, ResourceDef

from plugin_permission.catalog import runtime
from plugin_permission.extension import services
from plugin_permission.extension.schemas import ExtensionCreate
from plugin_permission.status_codes import RbacStatusCode

MANIFESTS = [
    PluginManifest(
        name="demo",
        version="0.1.0",
        resources=[ResourceDef(key="user", label="用户"), ResourceDef(key="position", label="岗位")],
        permission_codes=[
            PermissionCodeDef(code="user:read", label="查看用户", abac_action="read"),
            PermissionCodeDef(code="user:update", label="编辑用户", abac_action="write", depends=("user:read",)),
            PermissionCodeDef(code="position:read", label="查看岗位", abac_action="read"),
        ],
    )
]
BINDINGS = {"GET:/api/v1/users": "user:read", "GET:/api/v1/positions/all": "position:read"}
OPERATOR = UUID("00000000-0000-0000-0000-0000000000aa")


def _row(**fields):
    base = dict(id=UUID(int=1), route_key=None, depends_on=None, resource=None, label=None, abac_action=None, note="")
    base.update(fields)
    return SimpleNamespace(**base)


@pytest.fixture(autouse=True)
def _runtime():
    runtime.init_catalog_runtime(MANIFESTS, BINDINGS)


@pytest.fixture
def crud():
    fake = SimpleNamespace(
        list_ordered=AsyncMock(return_value=[]),
        create=AsyncMock(side_effect=lambda data: SimpleNamespace(id=UUID(int=9), **data)),
        get=AsyncMock(),
        update_by_id=AsyncMock(),
        delete=AsyncMock(),
        session=object(),
    )
    return fake


@pytest.fixture(autouse=True)
def _routes_registered(monkeypatch):
    monkeypatch.setattr(services, "route_registered", AsyncMock(return_value=True))
    monkeypatch.setattr(services, "after_commit", lambda session, fn, *args, **kwargs: None)


async def test_create_active_extension(crud):
    body = ExtensionCreate(kind="route_binding", code="user:update", route_key="GET:/api/v1/positions/all")
    item = await services.create_extension(crud, object(), body, OPERATOR)
    payload = crud.create.await_args.args[0]
    assert payload["kind"] == "route_binding"
    assert payload["created_by"] == OPERATOR
    assert item.id == UUID(int=9)


@pytest.mark.parametrize(
    ("body", "expected"),
    [
        (ExtensionCreate(kind="depends", code="user:update", depends_on="user:read"), RbacStatusCode.EXTENSION_DUPLICATES_BASELINE),
        (ExtensionCreate(kind="depends", code="user:update", depends_on="ghost:read"), RbacStatusCode.EXTENSION_UNKNOWN_CODE),
        (ExtensionCreate(kind="depends", code="user:read", depends_on="user:update"), RbacStatusCode.EXTENSION_DEPENDS_CYCLE),
        (
            ExtensionCreate(kind="route_binding", code="user:read", route_key="GET:/api/v1/missing"),
            RbacStatusCode.EXTENSION_UNKNOWN_ROUTE,
        ),
        (
            ExtensionCreate(kind="custom_code", code="user:x", resource="position", label="x", abac_action="read"),
            RbacStatusCode.EXTENSION_INVALID_CUSTOM_CODE,
        ),
    ],
)
async def test_create_rejects(crud, body, expected):
    with pytest.raises(AppException) as exc:
        await services.create_extension(crud, object(), body, OPERATOR)
    assert exc.value.status_code_enum == expected
    crud.create.assert_not_awaited()


async def test_create_rejects_duplicate_of_existing_extension(crud):
    crud.list_ordered.return_value = [_row(kind="depends", code="user:update", depends_on="position:read")]
    body = ExtensionCreate(kind="depends", code="user:update", depends_on="position:read")
    with pytest.raises(AppException) as exc:
        await services.create_extension(crud, object(), body, OPERATOR)
    assert exc.value.status_code_enum == RbacStatusCode.EXTENSION_ALREADY_EXISTS


async def test_route_must_exist_in_router_table(crud, monkeypatch):
    monkeypatch.setattr(services, "route_registered", AsyncMock(return_value=False))
    body = ExtensionCreate(kind="route_binding", code="user:update", route_key="GET:/api/v1/positions/all")
    with pytest.raises(AppException) as exc:
        await services.create_extension(crud, object(), body, OPERATOR)
    assert exc.value.status_code_enum == RbacStatusCode.EXTENSION_UNKNOWN_ROUTE


async def test_delete_custom_code_in_use_is_rejected(crud):
    custom = _row(id=UUID(int=1), kind="custom_code", code="user:audit", resource="user", label="审计", abac_action="read")
    ref = _row(id=UUID(int=2), kind="route_binding", code="user:audit", route_key="GET:/api/v1/users")
    crud.get.return_value = custom
    crud.list_ordered.return_value = [custom, ref]
    with pytest.raises(AppException) as exc:
        await services.delete_extension(crud, object(), UUID(int=1), OPERATOR)
    assert exc.value.status_code_enum == RbacStatusCode.EXTENSION_IN_USE
    crud.delete.assert_not_awaited()


async def test_delete_missing_raises_not_found(crud):
    crud.get.return_value = None
    with pytest.raises(AppException) as exc:
        await services.delete_extension(crud, object(), UUID(int=5), OPERATOR)
    assert exc.value.status_code_enum == RbacStatusCode.EXTENSION_NOT_FOUND


async def test_publish_rebuilds_bumps_and_pushes(monkeypatch):
    order: list[str] = []

    class _Session:
        async def __aenter__(self):
            return object()

        async def __aexit__(self, *exc):
            return False

    monkeypatch.setattr(services, "AsyncSessionLocal", _Session)
    monkeypatch.setattr(services, "rebuild_catalog", AsyncMock(side_effect=lambda s: order.append("rebuild")))
    monkeypatch.setattr(services, "bump_catalog_version", AsyncMock(side_effect=lambda r: order.append("bump") or 7))
    monkeypatch.setattr(services, "emit_permission_changed", AsyncMock(side_effect=lambda scope: order.append(scope)))

    await services.publish_catalog_change(object())

    assert order == ["rebuild", "bump", "menu"]
