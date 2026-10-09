"""Periodic worker metrics tasks."""

from kombu import Connection
from rapidkit_core.timezone import timezone
from redis.asyncio import Redis
from sqlmodel import select

from plugin_worker.dashboard import collect_queue_metrics, configured_queue_names
from plugin_worker.inventory import scoped_worker_filters
from plugin_worker.models import CeleryWorker, QueueDepthSnapshot


async def capture_queue_depth(
    redis, session_factory, *, queue_names=None, transport_options=None, celery_app=None
) -> None:
    """Persist the total number of waiting messages across active queues."""

    async with session_factory() as session:
        workers = list((await session.execute(select(CeleryWorker).where(*scoped_worker_filters()))).scalars().all())
        queues = {"celery"}
        for worker in workers:
            queues.update(str(queue) for queue in (worker.active_queues or []))
        if celery_app is not None:
            queue_names = configured_queue_names(celery_app, workers)
            transport_options = celery_app.conf.broker_transport_options or {}
        if queue_names is not None:
            options = transport_options or {}
            metrics = await collect_queue_metrics(
                redis,
                queue_names,
                workers,
                timezone.now(),
                priority_steps=options.get("priority_steps", (0, 3, 6, 9)),
                sep=options.get("sep", "\x06\x16"),
                prefix=options.get("global_keyprefix", ""),
            )
            if any(row.depth is None for row in metrics):
                return
            depth = sum(row.depth for row in metrics)
        else:
            depth = 0
            for queue in queues:
                depth += int(await redis.llen(queue) or 0)
        session.add(QueueDepthSnapshot(sampled_at=timezone.now(), depth=depth))
        await session.commit()


try:
    from src.queues.app import app
    from src.queues.deps import TaskSession

    @app.task(name="capture_queue_depth")
    async def capture_queue_depth_task(session: TaskSession) -> None:
        if Connection(app.conf.broker_url).transport.driver_type != "redis":
            return
        broker = Redis.from_url(str(app.conf.broker_url), socket_connect_timeout=2, socket_timeout=2)
        try:
            await capture_queue_depth(broker, session, celery_app=app)
        finally:
            await broker.aclose()
except ImportError:
    # Plugin unit tests import this module without the backend application shell.
    pass
