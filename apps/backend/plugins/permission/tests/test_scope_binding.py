# apps/backend/plugins/permission/tests/test_scope_binding.py
"""请求级范围绑定：合并结果 → 会话范围与字段规则。"""

from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

from rapidkit_common.scope_runtime import get_field_rules, get_session_scope, set_field_rules
from sqlmodel.ext.asyncio.session import AsyncSession

from plugin_permission import scope_binding
from plugin_permission.cache import CachedPermissions
from plugins.permission.tests.catalog_fixtures import ScopedFixtureItem, make_scoped_catalog

CATALOG = make_scoped_catalog()
REQUEST = SimpleNamespace(method="GET", url=SimpleNamespace(path="/api/v1/items"))


def _user(department_id=None):
    return SimpleNamespace(id=uuid4(), is_admin=False, roles=["editor"], department_id=department_id)


async def test_binds_condition_and_field_rules():
    session = AsyncSession()
    cached = CachedPermissions(codes=["item:read"], data_scopes={"item": ["self"]},
                               field_modes={"item": {"contact": "masked"}})

    await scope_binding.bind_request_scope(code="item:read", user=_user(), request=REQUEST, session=session,
                                           catalog=CATALOG, cached=cached)

    bound = get_session_scope(session)
    assert bound is not None and bound.model is ScopedFixtureItem
    assert "permission_fixture_items.owner_id" in str(bound.condition)
    assert get_field_rules() == {ScopedFixtureItem: {"phone": "masked", "email": "masked"}}
    set_field_rules({})


async def test_unrestricted_resource_binds_nothing():
    session = AsyncSession()
    await scope_binding.bind_request_scope(code="plain:read", user=_user(), request=REQUEST, session=session,
                                           catalog=CATALOG, cached=CachedPermissions(codes=["plain:read"]))
    assert get_session_scope(session) is None
    assert get_field_rules() == {}


async def test_dept_subtree_loads_subtree(monkeypatch):
    root = uuid4()
    load = AsyncMock(return_value=(root,))
    monkeypatch.setattr(scope_binding, "load_dept_subtree", load)
    session = AsyncSession()
    cached = CachedPermissions(codes=["item:read"], data_scopes={"item": ["dept_subtree"]})

    await scope_binding.bind_request_scope(code="item:read", user=_user(root), request=REQUEST, session=session,
                                           catalog=CATALOG, cached=cached)

    load.assert_awaited_once()
    assert "department_id IN" in str(get_session_scope(session).condition)
