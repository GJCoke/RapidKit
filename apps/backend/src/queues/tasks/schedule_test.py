"""
Celery scheduling diagnostic task.

Author : Coke
Date   : 2026-10-08
"""

from rapidkit_core.log import logger
from rapidkit_core.timezone import timezone

from src.queues.app import app
from src.queues.task import Task


@app.task(name="schedule_test", bind=True, ignore_result=False)
def schedule_test(self: Task, label: str = "schedule-test") -> dict[str, str | None]:
    """确认定时任务已执行；label 可用于区分不同的调度计划。"""
    result = {
        "label": label,
        "task_id": self.request.id,
        "worker": self.request.hostname,
        "executed_at": timezone.now_local().isoformat(),
    }
    logger.info(
        "Schedule test executed: task_id={task_id}, worker={worker}, executed_at={executed_at}",
        task_id=result["task_id"],
        worker=result["worker"],
        executed_at=result["executed_at"],
    )
    return result
