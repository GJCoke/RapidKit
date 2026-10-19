"""Menu navigation targets use isolated SQLite, with no application services."""

from types import SimpleNamespace
from uuid import uuid4

import pytest
import pytest_asyncio
from plugin_menu import register
from plugin_menu.models import Menu
from plugin_menu.providers import MenuNavigationProvider
from rapidkit_common.enums import MenuType, Status
from rapidkit_common.protocols.menu import MenuNavigationProvider as NavigationContract
from rapidkit_framework.services import ServiceRegistry
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.pool import StaticPool
from sqlmodel.ext.asyncio.session import AsyncSession


@pytest_asyncio.fixture
async def isolated_session():
    engine = create_async_engine("sqlite+aiosqlite://", poolclass=StaticPool)
    async with engine.begin() as connection:
        await connection.run_sync(Menu.__table__.create)
    async with AsyncSession(engine, expire_on_commit=False) as session:
        yield session
    await engine.dispose()


async def seed(session, **kwargs):
    value = Menu(
        menu_name="Page", route_name=f"page_{uuid4().hex}", route_path="/page", component="view.page", **kwargs
    )
    session.add(value)
    await session.flush()
    return value


@pytest.mark.asyncio
async def test_targets_include_hidden_system_pages_but_filter_disabled_and_external_pages(isolated_session):
    parent = await seed(isolated_session, menu_type=MenuType.DIRECTORY, status=Status.OFF)
    await seed(isolated_session, parent_id=parent.id)
    await seed(isolated_session, href="https://example.com")
    await seed(isolated_session, status=Status.OFF)
    system_pages = []
    for name in ("login", "403", "404", "500", "iframe-page"):
        isolated_session.add(
            Menu(
                menu_name=name,
                route_name=name,
                route_path=f"/{name}",
                component="view.iframe-page" if name == "iframe-page" else f"view.{name}",
                constant=True,
                hide_in_menu=True,
            )
        )
        if name != "iframe-page":
            system_pages.append(name)
    visible = await seed(isolated_session, hide_in_menu=True)
    provider = MenuNavigationProvider()
    targets = await provider.list_targets(isolated_session, SimpleNamespace(is_admin=True))
    assert {target.route for target in targets} == {*system_pages, visible.route_name}
    assert await provider.get_target(isolated_session, parent.id) is None


@pytest.mark.asyncio
async def test_public_system_targets_follow_constant_route_access_for_non_admins(isolated_session):
    login = Menu(
        menu_name="login",
        route_name="login",
        route_path="/login/:module(pwd-login|code-login|set-password)?",
        component="layout.blank$view.login",
        constant=True,
        hide_in_menu=True,
    )
    isolated_session.add(login)
    private = await seed(isolated_session, hide_in_menu=True)
    disabled = await seed(isolated_session, constant=True, status=Status.OFF)

    class Permissions:
        async def get_role_codes(self, roles):
            return set()

    provider = MenuNavigationProvider(permission_provider=Permissions())
    user = SimpleNamespace(is_admin=False, roles=[])
    targets = await provider.list_targets(isolated_session, user)
    assert [target.menu_id for target in targets] == [login.id]
    assert not targets[0].parameters[0].required
    assert await provider.get_target(isolated_session, login.id, user) is not None
    assert await provider.get_target(isolated_session, private.id, user) is None
    assert await provider.get_target(isolated_session, disabled.id, user) is None


@pytest.mark.asyncio
async def test_targets_follow_authorized_routes_and_hidden_detail_ancestor_permissions(isolated_session):
    directory = await seed(isolated_session, menu_type=MenuType.DIRECTORY)
    page = await seed(isolated_session, parent_id=directory.id, permission="page:read")
    detail = Menu(
        permission="user:read",
        menu_name="Detail",
        route_name="user_detail",
        route_path="/users/:id",
        component="view.detail",
        parent_id=page.id,
        active_menu_id=page.id,
        hide_in_menu=True,
        query=[{"key": "tab", "value": "profile"}],
    )
    isolated_session.add(detail)
    await isolated_session.flush()

    class Permissions:
        async def get_role_codes(self, roles):
            return {"user:read"} if roles == ["detail_only"] else {"page:read", "user:read"}

    provider = MenuNavigationProvider(permission_provider=Permissions())
    user = SimpleNamespace(is_admin=False, roles=["detail_only"])
    assert await provider.list_targets(isolated_session, user) == []
    user.roles = ["viewer"]
    targets = await provider.list_targets(isolated_session, user)
    target = next(target for target in targets if target.menu_id == detail.id)
    assert target.breadcrumb == ["Page", "Page", "Detail"]
    assert target.parameters[0].name == "id"
    assert target.parameters[0].required
    assert target.parameters[1].default_value == "profile"
    assert (
        await provider.get_target(isolated_session, detail.id, SimpleNamespace(is_admin=False, roles=["detail_only"]))
        is None
    )
    page.status = Status.OFF
    await isolated_session.flush()
    assert await provider.get_target(isolated_session, detail.id) is None


@pytest.mark.asyncio
async def test_deleted_parent_and_cycles_are_not_navigation_targets(isolated_session):
    parent = await seed(isolated_session, menu_type=MenuType.DIRECTORY)
    child = await seed(isolated_session, parent_id=parent.id)
    provider = MenuNavigationProvider()
    await isolated_session.delete(parent)
    await isolated_session.flush()
    assert await provider.get_target(isolated_session, child.id) is None
    child.parent_id = child.id
    await isolated_session.flush()
    assert await provider.get_target(isolated_session, child.id) is None


def test_menu_provider_registered_without_cross_plugin_orm_dependencies():

    manifest = register()
    registry = ServiceRegistry()
    manifest.service_factories[NavigationContract](registry)
    assert isinstance(registry.get(NavigationContract), MenuNavigationProvider)
