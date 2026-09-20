"""Recall broadcast tests."""

from typing import cast
from uuid import uuid4

import pytest
from plugin_notification.channels import notification_user_room
from plugin_notification.recall import broadcast_recall
from sqlmodel.ext.asyncio.session import AsyncSession


class _Rows:
    def __init__(self, user_ids):
        self._user_ids = user_ids

    def all(self):
        return list(self._user_ids)


class _Session:
    def __init__(self, user_ids):
        self._user_ids = user_ids
        self.statements = []

    async def exec(self, statement):
        self.statements.append(statement)
        return _Rows(self._user_ids)


class _Sio:
    def __init__(self, failing_room):
        self._failing_room = failing_room
        self.attempts = []

    async def emit(self, event, data, *, room, namespace):
        self.attempts.append((event, data, room, namespace))
        if room == self._failing_room:
            raise RuntimeError("recipient unavailable")


@pytest.mark.asyncio
async def test_broadcast_recall_deduplicates_user_rooms_and_isolates_emit_failures():
    message_id = uuid4()
    failed_user_id = uuid4()
    successful_user_id = uuid4()
    session = _Session([failed_user_id, failed_user_id, successful_user_id])
    sio = _Sio(notification_user_room(failed_user_id))

    sent = await broadcast_recall(
        cast(AsyncSession, session),
        message_id,
        sio_factory=lambda: sio,
    )

    assert len(session.statements) == 1
    assert sent == 1
    assert sio.attempts == [
        (
            "notification:recalled",
            {"messageId": str(message_id)},
            notification_user_room(failed_user_id),
            "/notifications",
        ),
        (
            "notification:recalled",
            {"messageId": str(message_id)},
            notification_user_room(successful_user_id),
            "/notifications",
        ),
    ]
