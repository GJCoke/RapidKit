"""Redis 7 observation recovery; never dispatches business tasks."""

import asyncio
import json
import time
from datetime import UTC, datetime

from plugin_worker.event_service import EventService
from pydantic import BaseModel, ConfigDict, Field, ValidationError
from rapidkit_core.config import settings
from rapidkit_core.database import AsyncSessionLocal
from rapidkit_core.diagnostics import task_diagnostics
from rapidkit_core.log import logger
from rapidkit_core.nanoid import request_id_scope
from rapidkit_core.transaction import run_after_commit_hooks
from rapidkit_framework.identity import identity_from_headers, identity_scope
from redis.asyncio import Redis

STREAM_KEY = "celery:events"
DEAD_STREAM_KEY = "celery:events:dead"
CONSUMER_GROUP = "fastapi-consumers"
REGISTERED_GROUPS = (CONSUMER_GROUP,)
PROCESS_TIMEOUT_SECONDS = 20
RETENTION_SECONDS = 7 * 86400
EVENT_HANDLERS = {
    "worker.online": "handle_worker_online",
    "worker.offline": "handle_worker_offline",
    "worker.heartbeat": "handle_worker_heartbeat",
    "task.started": "handle_task_started",
    "task.success": "handle_task_success",
    "task.failure": "handle_task_failure",
    "task.retry": "handle_task_retry",
    "task.revoked": "handle_task_revoked",
}


class _EventIdentity(BaseModel):
    model_config = ConfigDict(strict=True)
    task_id: str | None = Field(None, min_length=1, max_length=100)
    task_name: str = Field("", max_length=255)
    hostname: str = Field("", max_length=255)
    request_id: str | None = Field(None, min_length=1, max_length=100)
    correlation_id: str | None = Field(None, min_length=1, max_length=100)
    audit_correlation_id: str | None = Field(None, min_length=1, max_length=100)
    attempt: int | None = Field(None, ge=0, le=2147483647)
    concurrency: int = Field(0, ge=0, le=2147483647)
    group_name: str = Field("legacy", max_length=128)
    deployment_id: str = Field("", max_length=64)


class InvalidEvent(ValueError):
    def __init__(self, reason: str, event_type: str = "unknown", data: dict | None = None):
        super().__init__(reason)
        self.reason, self.event_type, self.data = reason, event_type, data or {}


def _validate_identity(kind: str, data: dict) -> None:
    if kind not in EVENT_HANDLERS:
        raise InvalidEvent("unknown_event")
    try:
        identity = _EventIdentity.model_validate(data)
    except ValidationError:
        raise InvalidEvent("invalid_fields", kind) from None
    if "attempt" in data and data["attempt"] is None:
        raise InvalidEvent("invalid_fields", kind)
    if kind.startswith("task.") and not identity.task_id or kind.startswith("worker.") and not identity.hostname:
        raise InvalidEvent("missing_identity", kind)


def encode_event(kind: str, data: dict, timestamp: str) -> dict[str, str]:
    _validate_identity(kind, data)
    return {"event_type": kind, "timestamp": timestamp, "data": json.dumps(task_diagnostics(data))}


def decode_event(fields: dict) -> tuple[str, dict]:
    kind = fields.get("event_type", "")
    if kind not in EVENT_HANDLERS:
        raise InvalidEvent("unknown_event")
    try:
        raw = fields.get("data", "{}")
        if len(raw.encode()) > 262144:
            raise InvalidEvent("oversized_event", kind)
        data = json.loads(raw)
    except json.JSONDecodeError, UnicodeError, RecursionError:
        raise InvalidEvent("invalid_json", kind) from None
    if not isinstance(data, dict):
        raise InvalidEvent("nonobject_data", kind)
    _validate_identity(kind, data)
    safe = task_diagnostics(data)
    safe.pop("timestamp", None)
    timestamp = fields.get("timestamp")
    if timestamp:
        try:
            if len(timestamp) > 64:
                raise ValueError("timestamp length")
            datetime.fromisoformat(timestamp).astimezone(UTC)
        except ValueError, TypeError, OverflowError:
            raise InvalidEvent("invalid_timestamp", kind, safe) from None
    safe["timestamp"] = timestamp
    return kind, safe


_ISOLATE = """
local pending = redis.call('XPENDING', KEYS[1], ARGV[1], ARGV[2], ARGV[2], 1)
if #pending == 0 then return 0 end
redis.call('XADD', KEYS[2], '*', 'source_id', ARGV[2], 'reason_code', ARGV[3],
           'event_type', ARGV[4], 'data', ARGV[5], 'timestamp', ARGV[6])
return redis.call('XACK', KEYS[1], ARGV[1], ARGV[2])
"""


async def process_message(
    redis: Redis, message_id: str, fields: dict, sio, *, session_factory=AsyncSessionLocal
) -> None:
    try:
        kind, data = decode_event(fields)
    except InvalidEvent as exc:
        isolated = await redis.execute_command(
            "EVAL",
            _ISOLATE,
            2,
            STREAM_KEY,
            DEAD_STREAM_KEY,
            CONSUMER_GROUP,
            message_id,
            exc.reason,
            exc.event_type,
            json.dumps(exc.data),
            "",
        )
        if isolated:
            logger.bind(event="task.event.isolated", reason_code=exc.reason).warning(
                "Observation isolated source_id={}", message_id
            )
        return
    with request_id_scope(data.get("request_id") or "-"), identity_scope(identity_from_headers(data)):
        async with asyncio.timeout(PROCESS_TIMEOUT_SECONDS):
            async with session_factory() as session:
                service = EventService(session=session, sio=sio)
                await getattr(service, EVENT_HANDLERS[kind])(data)
                await session.commit()
                await run_after_commit_hooks(session)
    await redis.xack(STREAM_KEY, CONSUMER_GROUP, message_id)


async def replay_dead_event(redis: Redis, dead_id: str, *, timestamp: str | None = None) -> str:
    rows = await redis.xrange(DEAD_STREAM_KEY, dead_id, dead_id, count=1)
    if not rows:
        raise ValueError("Dead observation not found")
    fields = rows[0][1]
    envelope = {"event_type": fields["event_type"], "data": fields["data"], "timestamp": fields.get("timestamp", "")}
    if fields["reason_code"] == "invalid_timestamp" and timestamp is None:
        raise ValueError("An explicitly corrected producer timestamp is required")
    if timestamp is not None:
        envelope["timestamp"] = timestamp
    kind, data = decode_event(envelope)
    producer_time = data.pop("timestamp")
    return await redis.xadd(
        STREAM_KEY,
        {
            "event_type": kind,
            "data": json.dumps(data),
            "timestamp": producer_time or "",
            "replay_of": dead_id,
        },
    )


_TRIM = """
if redis.call('TYPE', KEYS[1]).ok == 'none' then return {0, 'stream_missing', ''} end
local groups = redis.call('XINFO', 'GROUPS', KEYS[1])
if #groups ~= #ARGV - 1 or #groups == 0 then return {0, 'group_mismatch', ''} end
local function less(a, b)
    local am, as = string.match(a, '^(%d+)%-(%d+)$')
    local bm, bs = string.match(b, '^(%d+)%-(%d+)$')
    if #am ~= #bm then return #am < #bm end
    if am ~= bm then return am < bm end
    if #as ~= #bs then return #as < #bs end
    return as < bs
end
local floor = ARGV[1] .. '-0'
for _, values in ipairs(groups) do
    local group = {}
    for i = 1, #values, 2 do group[values[i]] = values[i+1] end
    local allowed = false
    for i = 2, #ARGV do if group.name == ARGV[i] then allowed = true end end
    if not allowed then return {0, 'group_mismatch', ''} end
    if group['last-delivered-id'] == '0-0' then return {0, 'group_uninitialized', ''} end
    if less(group['last-delivered-id'], floor) then floor = group['last-delivered-id'] end
    local pending = redis.call('XPENDING', KEYS[1], group.name)
    if pending[1] > 0 and less(pending[2], floor) then floor = pending[2] end
end
-- Bound each atomic maintenance pass to at most 1000 old entries.
local candidates = redis.call('XRANGE', KEYS[1], '-', '(' .. floor, 'COUNT', 1001)
if #candidates == 1001 then floor = candidates[1001][1] end
return {redis.call('XTRIM', KEYS[1], 'MINID', '=', floor), 'safe', floor}
"""


async def safe_trim(redis: Redis, *, cutoff_ms: int | None = None, groups: tuple[str, ...] = REGISTERED_GROUPS) -> dict:
    cutoff = max(0, int(time.time() * 1000) - RETENTION_SECONDS * 1000) if cutoff_ms is None else cutoff_ms
    if cutoff < 0 or not groups or len(set(groups)) != len(groups):
        raise ValueError("Invalid trim configuration")
    removed, reason, floor = await redis.execute_command("EVAL", _TRIM, 1, STREAM_KEY, str(cutoff), *groups)
    return {"removed": removed, "reason": reason, "floor": floor or None}


async def stream_status(redis: Redis) -> dict:
    groups = await redis.xinfo_groups(STREAM_KEY)
    pending, oldest, lag = 0, None, 0
    for group in groups:
        summary = await redis.xpending(STREAM_KEY, group["name"])
        pending += summary["pending"]
        if summary["min"]:
            age = max(0, time.time() - int(summary["min"].split("-")[0]) / 1000)
            oldest = max(oldest or 0, age)
        lag = lag + group["lag"] if lag is not None and group.get("lag") is not None else None
    return {
        "pending": pending,
        "oldest_pending_age_seconds": oldest,
        "lag": lag,
        "dead": await redis.xlen(DEAD_STREAM_KEY),
        "groups_valid": {g["name"] for g in groups} == set(REGISTERED_GROUPS),
    }


async def _operate(args) -> dict:
    async with Redis.from_url(str(settings.REDIS_URL), decode_responses=True) as redis:
        if args.command == "status":
            return await stream_status(redis)
        if args.command == "trim":
            return await safe_trim(redis)
        return {"replayed_observation_id": await replay_dead_event(redis, args.dead_id, timestamp=args.timestamp)}


def main() -> None:
    import argparse

    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("status")
    commands.add_parser("trim")
    replay = commands.add_parser("replay")
    replay.add_argument("dead_id")
    replay.add_argument("--timestamp", help="Explicitly corrected ISO producer time")
    print(json.dumps(asyncio.run(_operate(parser.parse_args()))))


if __name__ == "__main__":
    main()
