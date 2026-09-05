"""外部 Socket.IO emitter 测试。"""

from plugin_notification import emitter


def test_external_sio_is_lazy_write_only_singleton(monkeypatch):
    """首次访问创建 write-only emitter，后续访问复用同一实例。"""
    calls = []

    class _Manager:
        def __init__(self, *, url, write_only):
            calls.append(("manager", url, write_only))

    class _Server:
        def __init__(self, *, async_mode, client_manager):
            calls.append(("server", async_mode, client_manager))

    monkeypatch.setattr(emitter.socketio, "AsyncRedisManager", _Manager)
    monkeypatch.setattr(emitter.socketio, "AsyncServer", _Server)
    monkeypatch.setattr(emitter, "_external_sio", None)

    first = emitter.get_external_sio()
    second = emitter.get_external_sio()

    assert first is second
    assert calls[0] == ("manager", str(emitter.settings.REDIS_URL), True)
    assert calls[1][0:2] == ("server", "asgi")
    assert len(calls) == 2
