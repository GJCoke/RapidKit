"""Opt-in result expiration; receipts preserve B's duplicate guards indefinitely."""

import argparse
import asyncio
import json
from datetime import timedelta

from rapidkit_common.enums import TaskStatus
from rapidkit_core.config import settings
from rapidkit_core.database import AsyncSessionLocal
from rapidkit_core.log import get_plugin_logger
from rapidkit_core.timezone import timezone
from redis.asyncio import Redis
from sqlmodel import col, select

from plugin_worker.crud import TaskResultCRUD
from plugin_worker.models import CeleryTaskResult, TaskReceipt

logger = get_plugin_logger("Worker")


TERMINAL = (TaskStatus.SUCCESS, TaskStatus.FAILURE, TaskStatus.REVOKED)


async def referenced_tasks(redis) -> set[str]:
    # The application shell owns the Stream protocol; import only when executing retention.
    from src.queues.event_stream import DEAD_STREAM_KEY, REGISTERED_GROUPS, STREAM_KEY, decode_event

    groups = await redis.xinfo_groups(STREAM_KEY)
    if {group["name"] for group in groups} != set(REGISTERED_GROUPS) or any(
        group.get("lag") is None for group in groups
    ):
        raise ValueError("Cannot establish queue watermarks")
    floors = [group["last-delivered-id"] for group in groups]
    for group in groups:
        pending = await redis.xpending(STREAM_KEY, group["name"])
        if pending["pending"]:
            floors.append(pending["min"])
    floor = min(floors, key=lambda value: tuple(map(int, value.split("-"))))
    references, scanned = set(), 0
    for stream, lower in ((STREAM_KEY, floor), (DEAD_STREAM_KEY, "-")):
        while True:
            rows = await redis.xrange(stream, lower, "+", count=500)
            for message_id, fields in rows:
                scanned += 1
                if scanned > 10000:
                    raise ValueError("Reference scan budget exceeded; retention paused")
                if stream == STREAM_KEY:
                    _, data = decode_event(fields)
                else:
                    kind = fields.get("event_type", "")
                    if kind.startswith("worker."):
                        continue
                    if not kind.startswith("task."):
                        raise ValueError("Unknown isolation schema")
                    data = json.loads(fields.get("data", "{}"))
                    if not isinstance(data, dict) or not isinstance(data.get("task_id"), str):
                        raise ValueError("Isolation has no safe recoverable task reference")
                if data.get("task_id"):
                    references.add(data["task_id"])
            if len(rows) < 500:
                break
            lower = "(" + rows[-1][0]
    return references


async def prune_results(session, redis, *, days: int, apply: bool = False, limit: int = 1000) -> int:
    if days < 1 or not 1 <= limit <= 1000:
        raise ValueError("Invalid retention window/batch")
    references = await referenced_tasks(redis)
    cutoff = timezone.now() - timedelta(days=days)
    statement = select(CeleryTaskResult).where(
        col(CeleryTaskResult.status).in_(TERMINAL), col(CeleryTaskResult.finished_at) < cutoff
    )
    if references:
        statement = statement.where(col(CeleryTaskResult.task_id).not_in(references))
    candidates = list((await session.exec(statement.order_by(col(CeleryTaskResult.task_id)).limit(limit))).all())
    if not apply:
        return len(candidates)
    count = 0
    for candidate in candidates:
        task = await TaskResultCRUD(session).get_by_task_id(candidate.task_id, for_update=True)
        if task is None or task.status not in TERMINAL or task.finished_at is None or task.finished_at >= cutoff:
            logger.bind(
                event="worker.retention.skipped",
                outcome="skipped",
                reason_code="no_longer_eligible",
                task_id=candidate.task_id,
            ).debug("Task retention candidate no longer eligible")
            continue
        receipt = (await session.exec(select(TaskReceipt).where(TaskReceipt.task_id == task.task_id))).first()
        if receipt is None:
            session.add(TaskReceipt(task_id=task.task_id, attempt=task.retries))
        else:
            receipt.attempt = max(receipt.attempt, task.retries)
        await session.delete(task)
        await session.flush()
        count += 1
    return count


async def _run(args):
    async with Redis.from_url(
        str(settings.REDIS_URL), decode_responses=True, socket_connect_timeout=2, socket_timeout=2
    ) as redis:
        async with AsyncSessionLocal() as session:
            count = await prune_results(session, redis, days=args.days, apply=args.apply)
            if args.apply:
                await session.commit()
            print(json.dumps({"eligible": count, "applied": args.apply}))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--days", type=int, default=30)
    parser.add_argument("--apply", action="store_true")
    asyncio.run(_run(parser.parse_args()))


if __name__ == "__main__":
    main()
