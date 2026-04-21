"""
Socket.IO /worker namespace events.

Author  : Claude
Date    : 2026-03-30
"""

from typing import Literal

from fastapi_sio_di import SID
from rapidkit_core.log import get_plugin_logger

from src.sio.app import socket

logger = get_plugin_logger("Worker")


@socket.on("connect", namespace="/worker")
async def on_worker_connect(sid: SID) -> Literal[False] | None:
    """
    处理 /worker namespace 的连接事件。

    前端进入 Worker 管理页面时连接此 namespace。
    """
    logger.info("Client {sid} connected to /worker namespace", sid=sid)
    return None


@socket.on("disconnect", namespace="/worker")
async def on_worker_disconnect(sid: SID) -> None:
    """
    处理 /worker namespace 的断开连接事件。

    前端离开 Worker 管理页面时断开连接。
    """
    logger.info("Client {sid} disconnected from /worker namespace", sid=sid)
