"""
Write-only 外部 Socket.IO emitter：实现已下沉至 ``rapidkit_core.realtime``，此处保留兼容入口。
"""

from rapidkit_core.realtime import get_external_sio

__all__ = ["get_external_sio"]
