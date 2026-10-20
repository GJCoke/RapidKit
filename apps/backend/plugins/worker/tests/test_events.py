from unittest.mock import patch

from fastapi_sio_di import AsyncServer
from rapidkit_framework.identity import IdentityMetadata, identity_scope

with patch.object(AsyncServer, "instrument"):
    from plugin_worker import events


async def test_worker_connect_accepts_authenticated_identity():
    with identity_scope(IdentityMetadata("user", "actor")):
        assert await events.on_worker_connect("sid") is None
