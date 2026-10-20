"""Socket.IO /worker namespace."""

from fastapi_sio_di import SID
from rapidkit_core.log import get_plugin_logger
from rapidkit_framework.identity import current_identity
from src.sio.app import socket

logger = get_plugin_logger('Worker')


@socket.on('connect', namespace='/worker')
async def on_worker_connect(sid: SID) -> None:
    logger.debug('Worker socket connected sid={} user_id={}', sid, current_identity().user_id)
