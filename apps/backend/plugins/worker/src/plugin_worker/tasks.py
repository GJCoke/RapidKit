"""Periodic worker metrics tasks."""

from rapidkit_core.timezone import timezone


async def capture_queue_depth(redis, session_factory) -> None:
    """Persist the total number of waiting messages across active queues."""

    from sqlmodel import select

    from plugin_worker.models import CeleryWorker, QueueDepthSnapshot

    async with session_factory() as session:
        workers = list((await session.execute(select(CeleryWorker))).scalars().all())
        queues = {"celery"}
        for worker in workers:
            queues.update(str(queue) for queue in (worker.active_queues or []))
        depth = sum(int(await redis.llen(queue) or 0) for queue in queues)
        session.add(QueueDepthSnapshot(sampled_at=timezone.now(), depth=depth))
        await session.commit()


try:
    from src.queues.app import app
    from src.queues.deps import TaskRedis, TaskSession

    @app.task(name="capture_queue_depth")
    async def capture_queue_depth_task(redis: TaskRedis, session: TaskSession) -> None:
        await capture_queue_depth(redis, session)
except ImportError:
    # Plugin unit tests import this module without the backend application shell.
    pass
