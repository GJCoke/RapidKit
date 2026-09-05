"""AudienceResolver 测试 —— 用内存假实现替代跨插件服务。"""

from uuid import UUID, uuid4

import pytest
from plugin_notification.audience import AudienceResolver
from rapidkit_common.protocols.notification import AudienceRule
from rapidkit_framework.exceptions import AppException


class _FakeUser:
    def __init__(self, uid: UUID):
        self.id = uid


class _FakeQueryService:
    def __init__(self, by_role=None, by_dept=None, all_ids=None):
        self._by_role = by_role or {}
        self._by_dept = by_dept or {}
        self._all_ids = all_ids or []

    async def get_users_by_role(self, role_code: str):
        return [_FakeUser(uid) for uid in self._by_role.get(role_code, [])]

    async def get_users_by_department(self, dept_id: UUID):
        return [_FakeUser(uid) for uid in self._by_dept.get(dept_id, [])]

    async def get_all_active_user_ids(self):
        return list(self._all_ids)


@pytest.mark.asyncio
async def test_resolve_user_rule():
    """An explicit user rule resolves to the supplied user ID."""
    user_id = uuid4()
    resolver = AudienceResolver(query_service=_FakeQueryService())

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
    query_service = _FakeQueryService(by_role={"admin": [first, second]})
    resolver = AudienceResolver(query_service=query_service)

    ids = await resolver.resolve(
        [AudienceRule(type="user", value=str(first)), AudienceRule(type="role", value="admin")]
    )

    assert set(ids) == {first, second}
    assert len(ids) == len(set(ids))


@pytest.mark.asyncio
async def test_resolve_unknown_type_raises():
    """Unsupported audience types fail with an application exception."""
    resolver = AudienceResolver(query_service=_FakeQueryService())
    invalid_rule = AudienceRule.model_construct(type="galaxy", value=None, include_descendants=False)

    with pytest.raises(AppException):
        await resolver.resolve([invalid_rule])
