"""Acceptance-only API launcher observing the real consumer/domain-event boundary."""

import json

from rapidkit_common.events import TaskSucceededEvent
from rapidkit_core.database import RedisManager
from rapidkit_framework.events import event_bus
from rapidkit_framework.identity import identity_headers
from scripts.validation.impersonation_celery_probe import app as celery_app
from src.main import app

assert app.state.celery_app is celery_app


async def observe_completion(event: TaskSucceededEvent) -> None:
    await RedisManager.client().hset(
        "acceptance:domain-events",
        event.task_id,
        json.dumps(
            {
                "actor_id": event.actor_id,
                "metadata": identity_headers(event.identity_metadata),
                "handler_identity": identity_headers(),
                "task_name": event.task_name,
            }
        ),
    )


event_bus.on(TaskSucceededEvent, observe_completion)
