import asyncio
import inspect
import json
from dataclasses import dataclass
from types import SimpleNamespace
from typing import ClassVar
from unittest.mock import AsyncMock

import pytest
from rapidkit_common.events import TaskSucceededEvent
from rapidkit_core.timezone import timezone
from rapidkit_framework.events import Event, EventBus
from rapidkit_framework.identity import IdentityMetadata, current_identity, identity_scope


@dataclass
class IdentityEvent(Event):
    event_name: ClassVar[str] = "test.identity"
    value: str = "value"


@pytest.fixture
def bus():
    previous = EventBus._instance
    EventBus._reset()
    instance = EventBus()
    yield instance
    EventBus._instance = previous


@pytest.mark.asyncio
@pytest.mark.parametrize("entry", ["emit", "async_emit", "fire_and_forget", "distributed_emit"])
async def test_publication_snapshots_identity_and_restores_handler_context(bus, monkeypatch, entry):
    origin = IdentityMetadata("subject", "admin", "session")
    seen = []
    redis = SimpleNamespace(publish=AsyncMock())
    monkeypatch.setattr("rapidkit_framework.events.RedisManager.client", lambda: redis)
    bus.on(IdentityEvent, lambda event: seen.append((event.identity_metadata, current_identity())))
    event = IdentityEvent()
    with identity_scope(origin):
        result = getattr(bus, entry)(event)
        if inspect.isawaitable(result):
            await result
    with identity_scope(IdentityMetadata("other", "other")):
        await bus.shutdown()
    assert seen == [(origin, origin)]
    assert event.impersonation_session_id == "session"
    assert current_identity() == IdentityMetadata()
    if entry == "distributed_emit":
        payload = json.loads(redis.publish.await_args.args[1])
        assert payload["identity"] == {"user_id": "subject", "actor_id": "admin", "impersonation_session_id": "session"}


@pytest.mark.asyncio
async def test_subscriber_restores_serialized_metadata_without_leaking(bus, monkeypatch):
    seen = []
    bus.on(IdentityEvent, lambda event: seen.append(current_identity()))
    pubsub = SimpleNamespace(subscribe=AsyncMock(), close=AsyncMock())

    async def listen():
        for identity in [{"user_id": "subject", "actor_id": "admin", "impersonation_session_id": "session"}, {}]:
            yield {
                "type": "message",
                "data": json.dumps(
                    {
                        "instance_id": "remote",
                        "event_name": "test.identity",
                        "data": {"value": "remote"},
                        "identity": identity,
                    }
                ),
            }
        raise asyncio.CancelledError

    pubsub.listen = listen
    monkeypatch.setattr("rapidkit_framework.events.RedisManager.client", lambda: SimpleNamespace(pubsub=lambda: pubsub))
    await bus._subscribe_loop()
    assert seen == [IdentityMetadata("subject", "admin", "session"), IdentityMetadata()]
    assert current_identity() == IdentityMetadata()


def test_existing_positional_actor_contract_is_preserved(bus):
    event = TaskSucceededEvent("event", timezone.now(), "task", "name", 1.0, "explicit")
    assert event.actor_id == "explicit"
    assert inspect.signature(TaskSucceededEvent).parameters["actor_id"].kind == inspect.Parameter.POSITIONAL_OR_KEYWORD
    with identity_scope(IdentityMetadata("subject", "admin", "session")):
        bus.emit(event)
    assert event.actor_id == "explicit"
    assert event.identity_metadata == IdentityMetadata("subject", "admin", "session")
