"""外部 Socket.IO emitter 测试。"""

from rapidkit_core import realtime

from plugin_notification import emitter


def test_emitter_reexports_core_external_sio():
    """通知插件复用 core 的 write-only emitter。"""
    assert emitter.get_external_sio is realtime.get_external_sio
