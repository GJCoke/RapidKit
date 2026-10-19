"""功能包服务集成测试。"""

import pytest
from plugin_permission.catalog.registry import CatalogError, build_catalog, get_catalog, set_catalog
from plugin_permission.models import Role
from plugin_permission.package import services
from plugin_permission.package.crud import PermissionPackageCRUD
from plugin_permission.package.models import PermissionPackage
from plugin_permission.status_codes import RbacStatusCode
from rapidkit_framework.exceptions import AppException
from rapidkit_framework.plugin import PermissionCodeDef, PermissionPackageDef, PluginManifest, ResourceDef
from sqlmodel import select


def _manifest(packages: list[PermissionPackageDef]) -> PluginManifest:
    return PluginManifest(
        name="demo",
        version="0.1.0",
        resources=[
            ResourceDef(key="user", label="用户"),
            ResourceDef(key="role", label="角色"),
        ],
        permission_codes=[
            PermissionCodeDef(code="user:read", label="查看用户", abac_action="read"),
            PermissionCodeDef(code="user:update", label="编辑用户", abac_action="write", depends=("user:read",)),
            PermissionCodeDef(code="role:read", label="查看角色", abac_action="read"),
        ],
        permission_packages=packages,
    )


@pytest.fixture
def catalog_manifests():
    manifests = [
        _manifest(
            [
                PermissionPackageDef(key="user.readonly", label="用户 · 只读", codes=("user:read",)),
                PermissionPackageDef(key="user.full", label="用户 · 完整", codes=("user:read", "user:update")),
            ]
        )
    ]
    try:
        previous = get_catalog()
    except RuntimeError:
        previous = None
    set_catalog(build_catalog(manifests, {}))
    try:
        yield manifests
    finally:
        set_catalog(previous)


async def _role(session, codes: list[str]) -> Role:
    role = Role(name="编辑者", code="R_EDITOR", description="", permission_codes=codes)
    session.add(role)
    await session.flush()
    return role


async def test_sync_is_idempotent_and_removes_undeclared_builtin(session, catalog_manifests):
    session.add(PermissionPackage(key="gone.full", label="旧", codes=["role:read"], builtin=True))
    session.add(PermissionPackage(key="custom.mine", label="自建", codes=["role:read"], builtin=False))
    await session.flush()

    first = await services.sync_builtin_packages(session, catalog_manifests)
    second = await services.sync_builtin_packages(session, catalog_manifests)

    rows = {row.key: row for row in (await session.exec(select(PermissionPackage))).all()}
    assert set(rows) == {"user.readonly", "user.full", "custom.mine"}
    assert rows["user.full"].builtin is True
    assert rows["user.full"].codes == ["user:read", "user:update"]
    assert first.is_empty is False
    assert second.is_empty is True


async def test_sync_rejects_unknown_builtin_code(session):
    manifests = [_manifest([PermissionPackageDef(key="user.bad", label="坏", codes=("user:nope",))])]
    set_catalog(build_catalog([_manifest([])], {}))
    with pytest.raises(CatalogError):
        await services.sync_builtin_packages(session, manifests)


async def test_sync_rejects_duplicate_builtin_key(session):
    pkg = PermissionPackageDef(key="user.readonly", label="x", codes=("user:read",))
    manifests = [_manifest([pkg]), PluginManifest(name="other", version="0.1.0", permission_packages=[pkg])]
    set_catalog(build_catalog([_manifest([])], {}))
    with pytest.raises(CatalogError):
        await services.sync_builtin_packages(session, manifests)


async def test_validate_rejects_unknown_codes_and_scopes(session, catalog_manifests):
    with pytest.raises(AppException) as exc:
        await services.validate_package_content(["user:read", "x:y"], {}, {})
    assert exc.value.status_code_enum is RbacStatusCode.PACKAGE_INVALID_CODES

    with pytest.raises(AppException) as exc:
        await services.validate_package_content(["user:read"], {"user": "self"}, {})
    assert exc.value.status_code_enum is RbacStatusCode.PACKAGE_INVALID_SCOPES


async def test_apply_merge_and_replace(session, catalog_manifests):
    await services.sync_builtin_packages(session, catalog_manifests)
    role = await _role(session, ["role:read"])

    merged = await services.apply_packages_to_role(session, role.id, ["user.full"], "merge")
    assert merged.role.permission_codes == ["role:read", "user:read", "user:update"]
    assert merged.diff.added_codes == ["user:read", "user:update"]
    assert merged.diff.removed_codes == []

    replaced = await services.apply_packages_to_role(session, role.id, ["user.readonly"], "replace")
    assert replaced.role.permission_codes == ["user:read"]
    assert replaced.diff.removed_codes == ["role:read", "user:update"]


async def test_apply_unknown_package_key_fails(session, catalog_manifests):
    role = await _role(session, [])
    with pytest.raises(AppException) as exc:
        await services.apply_packages_to_role(session, role.id, ["custom.missing"], "merge")
    assert exc.value.status_code_enum is RbacStatusCode.PACKAGE_NOT_FOUND


async def test_package_edit_after_apply_does_not_change_role(session, catalog_manifests):
    crud = PermissionPackageCRUD(session)
    package = await crud.create({"key": "custom.ops", "label": "运维", "codes": ["user:read"], "builtin": False})
    role = await _role(session, [])
    await services.apply_packages_to_role(session, role.id, ["custom.ops"], "merge")

    await crud.update_by_id(package.id, {"codes": ["user:read", "user:update"]})

    refreshed = await session.get(Role, role.id)
    assert refreshed.permission_codes == ["user:read"]


async def test_builtin_package_is_readonly(session, catalog_manifests):
    await services.sync_builtin_packages(session, catalog_manifests)
    row = (await PermissionPackageCRUD(session).get_by_keys(["user.full"]))[0]
    with pytest.raises(AppException) as exc:
        services.ensure_editable(row)
    assert exc.value.status_code_enum is RbacStatusCode.PACKAGE_BUILTIN_READONLY


async def test_apply_uses_effective_scopes_for_diff_and_storage(session, catalog_manifests):
    from plugins.permission.tests.catalog_fixtures import make_scoped_catalog

    set_catalog(make_scoped_catalog())
    role = await _role(session, ["item:read"])
    role.data_scopes = {"item": "removed"}
    role.field_modes = {"item": {"note": "masked"}}
    session.add(PermissionPackage(key="custom.empty", label="Empty", codes=["item:read"]))
    await session.flush()
    result = await services.apply_packages_to_role(session, role.id, ["custom.empty"], "merge")
    assert result.role.data_scopes == {"item": "self"}
    assert result.role.field_modes == {"item": {"note": "hidden"}}
    assert result.diff.scope_changes == []
