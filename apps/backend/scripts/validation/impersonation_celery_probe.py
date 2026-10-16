"""Opt-in real-broker acceptance probes; never loaded by production discovery."""

import os

from rapidkit_framework.identity import identity_headers
from sqlalchemy import text
from src.queues.app import app
from src.queues.deps import TaskRedis, TaskSession
from src.queues.task import Task

# Isolate periodic activity without replacing the production expiry entry or interval.
expiry_entry = app.conf.beat_schedule["expire-impersonation-sessions"]
assert expiry_entry["schedule"] == 60.0
app.conf.beat_schedule = {"expire-impersonation-sessions": expiry_entry}


@app.task(name="impersonation_acceptance_probe", bind=True, max_retries=1)
async def identity_probe(
    self: Task, label: str, mode: str = "success", *, redis: TaskRedis, session: TaskSession
) -> dict:
    async with session() as database:
        assert (await database.execute(text("SELECT 1"))).scalar_one() == 1
    if mode == "failure":
        raise ValueError("intentional acceptance failure")
    if mode == "retry" and await redis.incr(f"acceptance:retry:{label}") == 1:
        raise self.retry(countdown=0, max_retries=1)
    return {
        "label": label,
        "identity": identity_headers(),
        "request_identity": {
            key: value
            for key, value in (self.request.headers or {}).items()
            if key in ("user_id", "actor_id", "impersonation_session_id")
        },
        "request_task_id": self.request.id,
        "request_retries": self.request.retries,
        "worker": self.request.hostname,
        "pid": os.getpid(),
    }
