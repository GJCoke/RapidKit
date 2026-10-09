"""
Celery scheduling diagnostic task.

Author : Coke
Date   : 2026-10-08
"""

import json

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
        "Schedule test executed: label={label}, task_id={task_id}, worker={worker}, executed_at={executed_at}",
        **result,
    )
    # stdout 会被 Task 基类捕获，随执行结果展示在任务日志中。
    print(json.dumps(result, ensure_ascii=False))
    return result
