"""服务器功能包直接应用到角色，不需要功能包数据库表。"""

import pytest
from plugin_permission.catalog.registry import build_catalog, get_catalog, set_catalog
from plugin_permission.models import Role
from plugin_permission.package import services
from plugins.permission.tests.test_static_permissions import manifest
from rapidkit_framework.exceptions import AppException
from rapidkit_framework.plugin import PermissionPackageDef
from sqlalchemy.ext.asyncio import create_async_engine
from sqlmodel.ext.asyncio.session import AsyncSession


@pytest.fixture
async def role_session():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as connection:
        await connection.run_sync(lambda sync: Role.__table__.create(sync))
    async with AsyncSession(engine, expire_on_commit=False) as session:
        yield session
    await engine.dispose()


@pytest.fixture
async def catalog_manifests():
    try:
        previous = get_catalog()
    except RuntimeError:
        previous = None
    definitions = [
        manifest(
            PermissionPackageDef(key="demo.readonly", label="Read", codes=("demo:read",)),
            PermissionPackageDef(key="demo.full", label="Full", codes=("demo:read", "demo:update")),
        )
    ]
    set_catalog(build_catalog(definitions, {}))
    yield definitions
    set_catalog(previous)


async def test_apply_merge_preserves_existing_role_restrictions(role_session, catalog_manifests):
    from plugins.permission.tests.catalog_fixtures import make_scoped_catalog

    catalog = make_scoped_catalog()
    catalog.packages = {"item.readonly": PermissionPackageDef(key="item.readonly", label="Read", codes=("item:read",))}
    set_catalog(catalog)
    role = Role(
        name="Restricted",
        code="RESTRICTED",
        permission_codes=["item:read"],
        data_scopes={"item": "self"},
        field_modes={"item": {"note": "hidden"}},
    )
    role_session.add(role)
    await role_session.flush()
    result = await services.apply_packages_to_role(role_session, role.id, ["item.readonly"], "merge")
    assert result.role.data_scopes == {"item": "self"}
    assert result.role.field_modes == {"item": {"note": "hidden"}}
    assert result.diff.scope_changes == []


async def test_apply_preserves_requested_package_order_and_is_one_time(role_session, catalog_manifests):
    role = Role(name="Ordered", code="ORDERED")
    role_session.add(role)
    await role_session.flush()
    result = await services.apply_packages_to_role(role_session, role.id, ["demo.full", "demo.readonly"], "replace")
    assert result.role.permission_codes == ["demo:read", "demo:update"]
    set_catalog(build_catalog([manifest()], {}))
    assert role.permission_codes == ["demo:read", "demo:update"]
    with pytest.raises(AppException):
        await services.apply_packages_to_role(role_session, role.id, ["demo.full"], "replace")
    assert role.permission_codes == ["demo:read", "demo:update"]
