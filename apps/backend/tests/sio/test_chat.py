from unittest.mock import AsyncMock, Mock, patch
from contextlib import asynccontextmanager

import pytest
from fastapi_sio_di import AsyncServer
from rapidkit_framework.identity import IdentityMetadata, identity_scope

with patch.object(AsyncServer, 'instrument'):
    from src.sio.events import chat


@pytest.fixture
def harness(monkeypatch):
    metadata = IdentityMetadata('trusted-user')
    data = {'trusted_identity': metadata, 'display_name': 'Doraemon'}
    server = AsyncMock()
    server.get_session.return_value = data

    @asynccontextmanager
    async def session(*args, **kwargs):
        yield data

    server.session = session
    monkeypatch.setattr(chat, 'socket', server)
    return server, data, metadata


async def test_chat_rejects_unknown_display_name(harness):
    assert await chat.on_connect('sid', {'display_name': 'Mallory'}) is False


async def test_chat_connect_keeps_trusted_identity(harness):
    server, data, metadata = harness
    with identity_scope(metadata):
        assert await chat.on_connect('sid', {'display_name': 'Nobita'}) is None
    assert data == {'trusted_identity': metadata, 'display_name': 'Nobita'}
    server.save_session.assert_not_awaited()


async def test_chat_message_carries_user_id_and_drops_avatar(harness):
    server, _, metadata = harness
    with identity_scope(metadata):
        await chat.on_message('sid', chat.MessageEvent(group='room', content='hello', avatar='forged'))
    message = server.emit.await_args.args[1]
    assert message.extra == {'user_id': 'trusted-user'}
    assert message.avatar is None
    assert message.sender == 'Doraemon'


async def test_chat_log_has_no_content(harness, monkeypatch):
    logger = Mock()
    monkeypatch.setattr(chat, 'logger', logger)
    with identity_scope(harness[2]):
        await chat.on_message('sid', chat.MessageEvent(group='room', content='private-message-marker'))
    assert 'private-message-marker' not in repr(logger.mock_calls)


@pytest.mark.parametrize('group', ['', 'x' * 65, None, 1])
async def test_chat_join_rejects_invalid_room(harness, group):
    await chat.on_join('sid', group)
    harness[0].enter_room.assert_not_awaited()
