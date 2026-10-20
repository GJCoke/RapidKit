from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from plugin_menu.models import Menu
from plugin_permission.catalog.loader import catalog_from_app
from plugin_permission.models import Role
from plugin_user.models import User
from plugins.permission.tests.catalog_fixtures import make_catalog
from rapidkit_common.enums import MenuType, Status
from rapidkit_core.database import _json_serializer
from sqlalchemy.ext.asyncio import create_async_engine
from sqlmodel import SQLModel, select
from sqlmodel.ext.asyncio.session import AsyncSession
from src import initdb
from src._menu_permissions import seed_menu_permission_codes
from src._menu_seeds import build_menus


@pytest.mark.asyncio
async def test_default_init_does_not_reset_existing_database():
    with patch.multiple(
        initdb,
        clean_db=AsyncMock(),
        create_departments=AsyncMock(),
        create_roles_and_users=AsyncMock(),
        create_menus=AsyncMock(),
    ):
        await initdb.init_db(AsyncMock())
        initdb.clean_db.assert_not_awaited()


@pytest.mark.asyncio
async def test_explicit_reset_still_supports_disposable_database_initialization():
    with patch.multiple(
        initdb,
        clean_db=AsyncMock(),
        create_departments=AsyncMock(),
        create_roles_and_users=AsyncMock(),
        create_menus=AsyncMock(),
    ):
        await initdb.init_db(AsyncMock(), reset=True)
        initdb.clean_db.assert_awaited_once()


@pytest.mark.asyncio
async def test_menu_sync_preserves_custom_metadata_and_is_idempotent():
    existing = build_menus()
    user = next(menu for menu in existing if menu.route_name == "manage_user")
    root = next(menu for menu in existing if menu.route_name == "manage")
    existing = [menu for menu in existing if menu.route_name != "manage_user-detail"]
    user.menu_name = "自定义用户"
    user.status = Status.OFF
    role = next(menu for menu in existing if menu.route_name == "manage_role")
    role.permission = "user:read"
    department = next(menu for menu in existing if menu.route_name == "manage_department")
    department.permission = None
    custom = Menu(menu_name="Custom", menu_type=MenuType.MENU, route_name="custom", route_path="/custom")
    existing.append(custom)
    result = MagicMock()
    result.all.return_value = existing
    session = MagicMock(exec=AsyncMock(return_value=result), commit=AsyncMock())

    def add_all(items):
        for item in items:
            if item not in existing:
                existing.append(item)

    session.add_all.side_effect = add_all
    await initdb.create_menus(session)
    assert user.menu_name == "自定义用户" and user.status == Status.OFF
    assert role.permission == "user:read"
    assert department.permission == "department:read"
    assert custom.permission is None
    detail = next(menu for menu in existing if menu.route_name == "manage_user-detail")
    assert detail.parent_id == root.id
    assert detail.permission == "user:read"
    before = [item.model_dump(warnings=False) for item in existing]
    await initdb.create_menus(session)
    assert [item.model_dump(warnings=False) for item in existing] == before


@pytest.mark.asyncio
async def test_sync_rejects_path_conflict_before_mutating_existing_menus():
    user = next(menu for menu in build_menus() if menu.route_name == "manage_user")
    user.permission = None
    conflict = Menu(menu_name="custom", route_name="custom", route_path="/manage")
    result = MagicMock()
    result.all.return_value = [user, conflict]
    session = MagicMock(exec=AsyncMock(return_value=result), commit=AsyncMock())
    with pytest.raises(ValueError, match="/manage"):
        await initdb.create_menus(session)
    assert user.permission is None
    session.commit.assert_not_awaited()


def test_seed_role_codes_come_from_catalog():
    catalog = make_catalog()

    admin_codes, guest_codes = initdb.seed_role_codes(catalog)

    assert admin_codes == sorted(catalog.codes)
    assert guest_codes == ["department:read", "role:read", "user:read"]
    assert "manage_user-detail" in initdb.GUEST_ROUTER_PERMISSIONS


def test_guest_permissions_are_derived_from_seed_menu_permissions():
    assert initdb.GUEST_PERMISSION_CODES == seed_menu_permission_codes(initdb.GUEST_ROUTER_PERMISSIONS)
    assert "user:read" in initdb.GUEST_PERMISSION_CODES
    assert all(code.endswith(":read") for code in initdb.GUEST_PERMISSION_CODES)


@pytest.mark.asyncio
async def test_existing_users_and_role_grants_are_preserved():
    admin = Role(name="restricted admin", code="ADMIN", interface_permissions=["GET:/custom"])
    guest = Role(name="custom guest", code="GUEST", router_permissions=["home"])
    results = []
    for item in (User(username="existing", name="Existing", password="unchanged"), admin, guest):
        result = MagicMock()
        result.first.return_value = item
        results.append(result)
    session = MagicMock(exec=AsyncMock(side_effect=results), commit=AsyncMock())
    await initdb.create_roles_and_users(session, make_catalog())
    session.add.assert_not_called()
    assert admin.interface_permissions == ["GET:/custom"]
    assert guest.router_permissions == ["home"]


@pytest.mark.asyncio
async def test_missing_role_is_created_without_recreating_existing_users():
    results = []
    for item in (
        User(username="existing", name="Existing", password="unchanged"),
        None,
        Role(name="Guest", code="GUEST"),
    ):
        result = MagicMock()
        result.first.return_value = item
        results.append(result)
    session = MagicMock(exec=AsyncMock(side_effect=results), commit=AsyncMock())
    await initdb.create_roles_and_users(session, make_catalog())
    session.add.assert_called_once()
    role = session.add.call_args.args[0]
    assert isinstance(role, Role) and role.code == "ADMIN"
    assert role.permission_codes == sorted(make_catalog().codes)


@pytest.mark.asyncio
async def test_real_bootstrap_and_repeat_preserve_stored_users_roles_and_custom_menus():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", json_serializer=_json_serializer)
    tables = [model.__table__ for model in (initdb.Department, Role, User, Menu)]
    try:
        async with engine.begin() as connection:
            await connection.run_sync(lambda sync: SQLModel.metadata.create_all(sync, tables=tables))
        async with AsyncSession(engine, expire_on_commit=False) as session:
            await initdb.init_db(session)
            menus = list((await session.exec(select(Menu))).all())
            users = list((await session.exec(select(User))).all())
            assert len(menus) == len(build_menus())
            assert len(users) == 4
            assert sum(user.is_admin for user in users) == 1
            user = next(user for user in users if user.username == "zhangsan")
            original_user = (user.id, user.password, user.is_admin, list(user.roles))
            guest = (await session.exec(select(Role).where(Role.code == "GUEST"))).one()
            guest.interface_permissions = ["GET:/custom"]
            user_menu = next(menu for menu in menus if menu.route_name == "manage_user")
            user_menu.menu_name = "自定义用户"
            user_menu.permission = "role:read"
            custom = Menu(menu_name="Custom", route_name="custom", route_path="/custom")
            session.add_all([guest, user_menu, custom])
            await session.commit()
            ids = {menu.id for menu in menus} | {custom.id}
            user_id, guest_id, menu_id = user.id, guest.id, user_menu.id
            await initdb.init_db(session)
            session.expire_all()
            assert {menu.id for menu in (await session.exec(select(Menu))).all()} == ids
            stored_user = await session.get(User, user_id)
            assert (stored_user.id, stored_user.password, stored_user.is_admin, stored_user.roles) == original_user
            stored_guest = await session.get(Role, guest_id)
            assert stored_guest.interface_permissions == ["GET:/custom"]
            stored_menu = await session.get(Menu, menu_id)
            assert stored_menu.menu_name == "自定义用户"
            assert stored_menu.permission == "role:read"
            await initdb.init_db(session, reset=True)
            assert len((await session.exec(select(User))).all()) == 4
            assert {menu.route_name for menu in (await session.exec(select(Menu))).all()} == {
                menu.route_name for menu in build_menus()
            }
    finally:
        await engine.dispose()


def test_seed_roles_only_grant_declared_codes(loaded_app):
    catalog, _ = catalog_from_app(loaded_app)
    admin, guest = initdb.seed_role_codes(catalog)
    assert "permission-extension:manage" not in catalog.codes
    assert set(admin) == set(catalog.codes)
    assert "permission-extension:manage" not in set(admin) | set(guest)
