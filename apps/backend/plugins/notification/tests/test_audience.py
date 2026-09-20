"""AudienceResolver 测试 —— 用内存假实现替代跨插件服务。"""

from uuid import UUID, uuid4

import pytest
from plugin_notification.audience import AudienceResolver
from rapidkit_common.protocols.notification import AudienceRule
from rapidkit_framework.exceptions import AppException


class _FakeQueryService:
    def __init__(self, active_ids=None, by_role=None, by_dept=None, all_ids=None):
        self._active_ids = active_ids or []
        self._by_role = by_role or {}
        self._by_dept = by_dept or {}
        self._all_ids = all_ids or []
        self.department_calls = []

    async def get_active_user_ids(self, user_ids: list[UUID]):
        return [uid for uid in user_ids if uid in self._active_ids]

    async def get_active_user_ids_by_role(self, role_code: str):
        return list(self._by_role.get(role_code, []))

    async def get_active_user_ids_by_department(self, dept_id: UUID, include_descendants: bool):
        self.department_calls.append((dept_id, include_descendants))
        return list(self._by_dept.get((dept_id, include_descendants), []))

    async def get_all_active_user_ids(self):
        return list(self._all_ids)


@pytest.mark.asyncio
async def test_resolve_user_rule():
    """An explicit user rule resolves to the supplied user ID."""
    user_id = uuid4()
    resolver = AudienceResolver(query_service=_FakeQueryService(active_ids=[user_id]))

    ids = await resolver.resolve([AudienceRule(type="user", value=str(user_id))])

    assert ids == [user_id]


@pytest.mark.asyncio
async def test_resolve_role_rule():
    """A role rule resolves all users returned by the user query service."""
    first, second = uuid4(), uuid4()
    query_service = _FakeQueryService(by_role={"admin": [first, second]})
    resolver = AudienceResolver(query_service=query_service)

    ids = await resolver.resolve([AudienceRule(type="role", value="admin")])

    assert set(ids) == {first, second}


@pytest.mark.asyncio
async def test_resolve_all_rule():
    """An all rule resolves every active user ID."""
    first, second = uuid4(), uuid4()
    resolver = AudienceResolver(query_service=_FakeQueryService(all_ids=[first, second]))

    ids = await resolver.resolve([AudienceRule(type="all")])

    assert set(ids) == {first, second}


@pytest.mark.asyncio
async def test_resolve_union_dedup():
    """Overlapping audience rules emit each recipient only once."""
    first, second = uuid4(), uuid4()
    query_service = _FakeQueryService(active_ids=[first], by_role={"admin": [first, second]})
    resolver = AudienceResolver(query_service=query_service)

    ids = await resolver.resolve(
        [AudienceRule(type="user", value=str(first)), AudienceRule(type="role", value="admin")]
    )

    assert set(ids) == {first, second}
    assert len(ids) == len(set(ids))


@pytest.mark.asyncio
async def test_resolve_explicit_user_filters_inactive_user():
    inactive_user_id = uuid4()
    resolver = AudienceResolver(query_service=_FakeQueryService(active_ids=[]))

    ids = await resolver.resolve([AudienceRule(type="user", value=str(inactive_user_id))])

    assert ids == []


@pytest.mark.asyncio
async def test_resolve_department_passes_include_descendants():
    department_id, user_id = uuid4(), uuid4()
    query_service = _FakeQueryService(by_dept={(department_id, True): [user_id]})
    resolver = AudienceResolver(query_service=query_service)

    ids = await resolver.resolve(
        [AudienceRule(type="department", value=str(department_id), include_descendants=True)]
    )

    assert ids == [user_id]
    assert query_service.department_calls == [(department_id, True)]


@pytest.mark.asyncio
async def test_resolve_unknown_type_raises():
    """Unsupported audience types fail with an application exception."""
    resolver = AudienceResolver(query_service=_FakeQueryService())
    invalid_rule = AudienceRule.model_construct(type="galaxy", value=None, include_descendants=False)

    with pytest.raises(AppException):
        await resolver.resolve([invalid_rule])
