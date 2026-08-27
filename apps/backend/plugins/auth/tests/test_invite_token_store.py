from uuid import uuid4

import pytest
from plugin_auth.invite.token_store import InviteTokenStore


class FakeRedis:
    def __init__(self) -> None:
        self.store: dict[str, str] = {}

    async def set(self, key: str, value: str, ex=None) -> None:
        self.store[key] = value

    async def get(self, key: str):
        return self.store.get(key)

    async def getdel(self, key: str):
        return self.store.pop(key, None)

    async def delete(self, *keys: str) -> None:
        for key in keys:
            self.store.pop(key, None)

    async def exists(self, key: str) -> int:
        return int(key in self.store)


@pytest.mark.asyncio
async def test_issue_then_consume_is_single_use() -> None:
    store = InviteTokenStore(FakeRedis())
    user_id = uuid4()
    token = await store.issue(user_id)
    assert await store.consume(token) == str(user_id)
    assert await store.consume(token) is None
    assert await store.exists(token) is False


@pytest.mark.asyncio
async def test_issue_revokes_previous_token_for_user() -> None:
    store = InviteTokenStore(FakeRedis())
    user_id = uuid4()
    old = await store.issue(user_id)
    new = await store.issue(user_id)
    assert old != new
    assert await store.exists(old) is False
    assert await store.exists(new) is True
