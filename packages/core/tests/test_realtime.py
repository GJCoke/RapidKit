"""跨进程 Socket.IO 推送测试。"""

from unittest.mock import AsyncMock, MagicMock

import pytest
from rapidkit_core import realtime


def test_external_sio_is_lazy_write_only_singleton(monkeypatch):
    calls = []

    class _Manager:
        def __init__(self, *, url, write_only):
            calls.append(("manager", url, write_only))

    class _Server:
        def __init__(self, *, async_mode, client_manager):
            calls.append(("server", async_mode, client_manager))

    monkeypatch.setattr(realtime.socketio, "AsyncRedisManager", _Manager)
    monkeypatch.setattr(realtime.socketio, "AsyncServer", _Server)
    monkeypatch.setattr(realtime, "_external_sio", None)

    first = realtime.get_external_sio()
    second = realtime.get_external_sio()

    assert first is second
    assert calls[0] == ("manager", str(realtime.settings.REDIS_URL), True)
    assert calls[1][0:2] == ("server", "asgi")
    assert len(calls) == 2


def _fake_sio(monkeypatch) -> MagicMock:
    sio = MagicMock()
    sio.emit = AsyncMock()
    monkeypatch.setattr(realtime, "_external_sio", sio)
    return sio


@pytest.mark.asyncio
async def test_roles_scope_broadcasts_codes(monkeypatch):
    sio = _fake_sio(monkeypatch)

    await realtime.emit_permission_changed("roles", roles=["editor"])

    event, payload = sio.emit.await_args.args
    assert event == realtime.PERMISSION_EVENT
    assert payload["scope"] == "roles"
    assert payload["roles"] == ["editor"]
    assert payload["revision"] > 0
    assert sio.emit.await_args.kwargs == {"room": realtime.PERMISSION_BROADCAST_ROOM}


@pytest.mark.asyncio
async def test_user_scope_targets_user_room(monkeypatch):
    sio = _fake_sio(monkeypatch)

    await realtime.emit_permission_changed("user", user_id="u1")

    _, payload = sio.emit.await_args.args
    assert "roles" not in payload
    assert sio.emit.await_args.kwargs == {"room": "perm:user:u1"}


@pytest.mark.asyncio
async def test_emit_failure_is_swallowed(monkeypatch):
    sio = _fake_sio(monkeypatch)
    sio.emit.side_effect = ConnectionError("redis down")

    await realtime.emit_permission_changed("menu")
