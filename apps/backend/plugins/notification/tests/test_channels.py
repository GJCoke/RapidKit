"""渠道适配器测试。"""

from uuid import uuid4

import pytest
from plugin_notification.channels import ChannelRegistry, ChannelResult, InAppChannel


class _FakeRedis:
    def __init__(self, sid=None):
        self._sid = sid
        self.keys = []

    async def get(self, key):
        self.keys.append(key)
        return self._sid


class _FakeSio:
    def __init__(self, *, error=None):
        self.error = error
        self.emitted = []

    async def emit(self, event, data, to=None, room=None, namespace=None):
        if self.error is not None:
            raise self.error
        self.emitted.append((event, data, to, room, namespace))


@pytest.mark.asyncio
async def test_inapp_channel_emits_to_stable_user_room_without_sid_lookup():
    user_id = uuid4()
    redis = _FakeRedis(sid="root-sid-that-is-invalid-in-notifications-namespace")
    sio = _FakeSio()
    channel = InAppChannel(sio_factory=lambda: sio)

    result = await channel.deliver(
        redis=redis,
        user_id=user_id,
        payload={"id": "m1", "level": "info"},
    )

    assert isinstance(result, ChannelResult)
    assert result.success is True
    assert redis.keys == []
    assert sio.emitted == [
        (
            "notification:new",
            {"id": "m1", "level": "info"},
            None,
            f"notification:user:<{user_id}>",
            "/notifications",
        )
    ]


@pytest.mark.asyncio
async def test_inapp_channel_returns_failure_when_emit_raises():
    channel = InAppChannel(sio_factory=lambda: _FakeSio(error=RuntimeError("boom")))

    result = await channel.deliver(
        redis=_FakeRedis(sid="sid-123"),
        user_id=uuid4(),
        payload={"id": "m1"},
    )

    assert result == ChannelResult(success=False, error_code="inapp_emit_failed")


def test_registry_get_known_and_unknown():
    registry = ChannelRegistry()
    channel = InAppChannel()

    registry.register("in_app", channel)

    assert registry.get("in_app") is channel
    assert registry.get("email") is None
