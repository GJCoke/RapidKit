"""Per-instance audit delivery counters exposed through application health."""

from rapidkit_core.log import get_plugin_logger

logger = get_plugin_logger("System")
counters = {"queued": 0, "flushed": 0, "retried": 0, "failed": 0, "buffer_size": 0}


def record_delivery(event: str, count: int) -> None:
    if event == "buffer_size":
        counters[event] = count
    elif event in counters:
        counters[event] += count
    if event == "failed":
        logger.error("Audit delivery failure count={} totals={}", count, counters)
