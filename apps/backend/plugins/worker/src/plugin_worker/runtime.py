"""Read-only current Worker pool capacity and execution snapshot."""

import asyncio

from rapidkit_core.log import get_plugin_logger
from rapidkit_core.timezone import timezone

logger = get_plugin_logger("Worker")


async def inspect_worker_runtime(celery_app, hostname: str) -> dict:
    def query(kind):
        try:
            reply = getattr(celery_app.control.inspect(destination=[hostname], timeout=1), kind)()
            return reply.get(hostname) if isinstance(reply, dict) else None
        except Exception as exc:
            logger.bind(
                event="worker.inspect.degraded",
                outcome="degraded",
                reason_code="inspect_failed",
                exception_type=type(exc).__name__,
                operation=kind,
            ).warning("Worker runtime inspection failed")
            return None

    stats, active = await asyncio.gather(asyncio.to_thread(query, "stats"), asyncio.to_thread(query, "active"))
    pool = stats.get("pool", {}) if isinstance(stats, dict) else {}
    processes = pool.get("processes") if isinstance(pool, dict) else None
    configured = pool.get("max-concurrency") if isinstance(pool, dict) else None
    capacity = len(processes) if isinstance(processes, list) else configured
    if not isinstance(capacity, int) or isinstance(capacity, bool) or capacity < 0:
        capacity = None
    active_count = len(active) if isinstance(active, list) else None
    return {
        "runtime_concurrency": capacity,
        "runtime_active_tasks": active_count,
        "runtime_sampled_at": timezone.now() if capacity is not None or active_count is not None else None,
    }
