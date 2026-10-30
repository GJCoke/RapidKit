"""Read-only Celery overview with explicit broker and completion semantics."""

import asyncio
from datetime import timedelta

from kombu import Connection
from rapidkit_common.enums import TaskStatus
from rapidkit_core.log import get_plugin_logger
from rapidkit_core.timezone import timezone
from redis.asyncio import Redis
from sqlalchemy import case
from sqlmodel import col, func, select
from sqlmodel.sql.expression import Select

from plugin_worker.inventory import group_summaries, scoped_worker_filters
from plugin_worker.models import CeleryTaskResult, CeleryWorker, QueueDepthSnapshot
from plugin_worker.operations import HEARTBEAT_TIMEOUT_SECONDS, is_worker_healthy, summarize_worker_capacity
from plugin_worker.schemas import DashboardDepthPoint, DashboardTimelinePoint, QueueDashboardResponse, QueueMetric

logger = get_plugin_logger("worker")


def fill_history_buckets(rows, start, end, *, days, missing):
    if not rows:
        return []
    daily = days > 7
    values = {(row[0].date() if daily else row[0]): tuple(row[1:]) for row in rows}
    if daily:
        current, end = timezone.to_local(start).date(), timezone.to_local(end).date()
    else:
        current = start.replace(minute=0, second=0, microsecond=0)
    step = timedelta(days=1) if daily else timedelta(hours=1)
    filled = []
    while current <= end:
        filled.append((current, *values.get(current, missing)))
        current += step
    return filled


def completion_rate(success: int, failure: int) -> float | None:
    total = success + failure
    return round(success / total * 100, 2) if total else None


async def collect_queue_metrics(
    broker, names, workers, now, *, priority_steps=(0, 3, 6, 9), sep="\x06\x16", prefix="", unknown_workers=()
):
    healthy = [w for w in workers if is_worker_healthy(w.status, w.last_heartbeat, now, HEARTBEAT_TIMEOUT_SECONDS)]
    rows = []
    for name in sorted(set(names)):
        try:
            depth = 0
            for priority in priority_steps:
                key = name if priority == 0 else f"{name}{sep}{priority}"
                depth += int(await broker.llen(f"{prefix}{key}") or 0)
        except Exception as exc:
            logger.warning("Queue depth unavailable for {}: {}", name, type(exc).__name__)
            depth = None
        rows.append(
            QueueMetric(
                name=name,
                depth=depth,
                consumers=None
                if any(w.hostname in unknown_workers for w in healthy)
                else sum(name in (w.active_queues or []) for w in healthy),
            )
        )
    return rows


def configured_queue_names(celery_app, workers):
    names = {str(celery_app.conf.task_default_queue or "celery")}
    names.update(str(name) for name in celery_app.amqp.queues)
    for worker in workers:
        names.update(str(name) for name in (worker.active_queues or []))
    routes = celery_app.conf.task_routes
    if isinstance(routes, dict):
        names.update(route["queue"] for route in routes.values() if isinstance(route, dict) and route.get("queue"))
    return names


async def resolve_worker_subscriptions(celery_app, workers, now):
    missing = {
        w.hostname
        for w in workers
        if not w.active_queues and is_worker_healthy(w.status, w.last_heartbeat, now, HEARTBEAT_TIMEOUT_SECONDS)
    }
    if not missing:
        return workers, set()
    try:
        inspector = celery_app.control.inspect(destination=sorted(missing), timeout=1)
        replies = await asyncio.to_thread(inspector.active_queues)
        replies = replies if isinstance(replies, dict) else {}
    except Exception as exc:
        logger.warning("Worker queue subscriptions unavailable: {}", type(exc).__name__)
        replies = {}
    enriched = []
    for worker in workers:
        queues = replies.get(worker.hostname)
        if isinstance(queues, list):
            names = [q["name"] for q in queues if isinstance(q, dict) and isinstance(q.get("name"), str)]
            enriched.append(worker.model_copy(update={"active_queues": names}))
            missing.discard(worker.hostname)
        else:
            enriched.append(worker)
    return enriched, missing


async def get_queue_dashboard(session, celery_app, days: int) -> QueueDashboardResponse:
    now = timezone.now()
    start = now - timedelta(days=days)
    workers = list((await session.exec(select(CeleryWorker).where(*scoped_worker_filters()))).all())
    groups = await group_summaries(session, now)
    capacity = summarize_worker_capacity(groups)
    workers, unknown_workers = await resolve_worker_subscriptions(celery_app, workers, now)
    healthy = [w for w in workers if is_worker_healthy(w.status, w.last_heartbeat, now, HEARTBEAT_TIMEOUT_SECONDS)]
    conf = celery_app.conf
    names = configured_queue_names(celery_app, workers)
    transport = Connection(conf.broker_url).transport.driver_type
    if transport == "redis":
        options = conf.broker_transport_options or {}
        broker = Redis.from_url(str(conf.broker_url), socket_connect_timeout=2, socket_timeout=2)
        try:
            queues = await collect_queue_metrics(
                broker,
                names,
                workers,
                now,
                priority_steps=options.get("priority_steps", (0, 3, 6, 9)),
                sep=options.get("sep", "\x06\x16"),
                prefix=options.get("global_keyprefix", ""),
                unknown_workers=unknown_workers,
            )
        finally:
            await broker.aclose()
    else:
        queues = [
            QueueMetric(
                name=name,
                depth=None,
                consumers=None if unknown_workers else sum(name in (w.active_queues or []) for w in healthy),
            )
            for name in sorted(names)
        ]

    task = CeleryTaskResult
    finished = (col(task.finished_at) >= start, col(task.finished_at) <= now)
    outcome = Select(
        func.count().filter(col(task.status) == TaskStatus.SUCCESS),
        func.count().filter(col(task.status) == TaskStatus.FAILURE),
        func.count().filter(col(task.status) == TaskStatus.REVOKED),
        func.avg(col(task.runtime)).filter(col(task.status) == TaskStatus.SUCCESS),
        func.percentile_cont(0.95).within_group(col(task.runtime)).filter(col(task.status) == TaskStatus.SUCCESS),
    ).where(*finished)
    success, failure, revoked, avg, p95 = (await session.exec(outcome)).one()
    retry = (
        await session.exec(
            select(func.count())
            .select_from(task)
            .where(col(task.status) == TaskStatus.RETRY, col(task.create_time) >= start)
        )
    ).one()
    recent = (
        await session.exec(
            select(func.count())
            .select_from(task)
            .where(
                col(task.status).in_([TaskStatus.SUCCESS, TaskStatus.FAILURE]),
                col(task.finished_at) >= now - timedelta(minutes=15),
                col(task.finished_at) <= now,
            )
        )
    ).one()
    finished_at = col(task.finished_at)
    if days > 7:
        finished_at = func.timezone(str(timezone.tz_info), func.timezone("UTC", finished_at))
    bucket = func.date_trunc("hour" if days <= 7 else "day", finished_at).label("time_bucket")
    timeline_rows = (
        await session.exec(
            select(
                bucket,
                func.sum(case((col(task.status) == TaskStatus.SUCCESS, 1), else_=0)),
                func.sum(case((col(task.status) == TaskStatus.FAILURE, 1), else_=0)),
            )
            .where(*finished, col(task.status).in_([TaskStatus.SUCCESS, TaskStatus.FAILURE]))
            .group_by(bucket)
            .order_by(bucket)
        )
    ).all()
    sampled_at = col(QueueDepthSnapshot.sampled_at)
    if days > 7:
        sampled_at = func.timezone(str(timezone.tz_info), func.timezone("UTC", sampled_at))
    depth_bucket = func.date_trunc("hour" if days <= 7 else "day", sampled_at).label("time_bucket")
    depths = (
        await session.exec(
            select(depth_bucket, func.avg(col(QueueDepthSnapshot.depth)))
            .where(
                col(QueueDepthSnapshot.sampled_at) >= start,
                col(QueueDepthSnapshot.sampled_at) <= now,
            )
            .group_by(depth_bucket)
            .order_by(depth_bucket)
        )
    ).all()
    return QueueDashboardResponse(
        sampled_at=now,
        queues=queues,
        queue_depth=sum(q.depth for q in queues if q.depth is not None)
        if all(q.depth is not None for q in queues)
        else None,
        online_workers=capacity.healthy,
        total_workers=capacity.total,
        missing_workers=capacity.missing or 0,
        capacity_known=capacity.capacity_known,
        active_tasks=sum(w.active_task_count for w in healthy),
        concurrency=sum(w.concurrency for w in healthy),
        throughput=round(recent / 15, 2),
        success=success,
        failure=failure,
        retry=retry,
        revoked=revoked,
        success_rate=completion_rate(success, failure),
        avg_runtime=round(avg, 3) if avg is not None else None,
        p95_runtime=round(p95, 3) if p95 is not None else None,
        timeline=[
            DashboardTimelinePoint(time_bucket=t, success=s, failure=f)
            for t, s, f in fill_history_buckets(timeline_rows, start, now, days=days, missing=(0, 0))
        ],
        depth_timeline=[
            DashboardDepthPoint(time_bucket=t, depth=round(d, 2) if d is not None else None)
            for t, d in fill_history_buckets(depths, start, now, days=days, missing=(None,))
        ],
    )
