"""角色删除监听器测试。"""

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
from uuid import UUID

from rapidkit_common.events import RoleDeletedEvent, RolePermissionsChangedEvent

import plugin_user
from plugin_user import services

USER_ID = UUID("00000000-0000-0000-0000-0000000000bb")


class _Session:
    def __init__(self, users):
        self._users = users
        self.commit = AsyncMock()

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    async def exec(self, stmt):
        return MagicMock(all=MagicMock(return_value=self._users))


async def test_role_deleted_strips_code_and_clears_user_cache(monkeypatch):
    user = SimpleNamespace(id=USER_ID, roles=["editor", "viewer"])
    session = _Session([user])
    invalidate = AsyncMock()
    monkeypatch.setattr("rapidkit_core.database.AsyncSessionLocal", lambda: session)
    monkeypatch.setattr("rapidkit_core.database.RedisManager.client", lambda: "redis")
    monkeypatch.setattr(services, "invalidate_user_cache", invalidate)

    await plugin_user._on_role_deleted(RoleDeletedEvent(role_code="editor"))

    assert user.roles == ["viewer"]
    session.commit.assert_awaited_once()
    invalidate.assert_awaited_once_with("redis", USER_ID)


def test_role_permission_change_no_longer_fans_out_per_user():
    manifest = plugin_user.register()
    assert RolePermissionsChangedEvent not in [event for event, _ in manifest.event_listeners]
    assert not hasattr(services, "invalidate_users_by_role_code")
