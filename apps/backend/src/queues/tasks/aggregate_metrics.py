"""
API 指标聚合 Celery 定时任务。

Author : Coke
Date   : 2026-04-14
"""

from plugin_monitoring.aggregator import aggregate_once, cleanup_old_metrics

from src.queues.app import app
from src.queues.deps import TaskRedis, TaskSession


@app.task(name="aggregate_api_metrics")
async def aggregate_api_metrics(redis: TaskRedis, session: TaskSession) -> None:
    """单次执行 API 指标聚合（由 Celery Beat 每 60 秒调用）。"""
    await aggregate_once(redis, session)


@app.task(name="cleanup_old_api_metrics")
async def cleanup_old_api_metrics(session: TaskSession) -> None:
    """清理过期 API 指标归档数据（由 Celery Beat 每天凌晨调用）。"""
    await cleanup_old_metrics(session)
