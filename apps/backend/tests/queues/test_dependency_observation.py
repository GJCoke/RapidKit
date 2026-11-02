import asyncio
import json

from celery import Celery


async def test_actual_task_session_uses_dependency_observation_and_keeps_result(monkeypatch):
    from rapidkit_core import log
    from rapidkit_core.config import settings
    from sqlalchemy import text
    from src.queues.deps import TaskSession
    from src.queues.task import Task

    class DatabaseTask(Task):
        name = "test.database"

        async def run(self, session: TaskSession):
            async with session() as tx:
                return await tx.scalar(text("SELECT 17"))

    monkeypatch.setattr(settings, "DEPENDENCY_SLOW_THRESHOLD_MS", 0)
    log.setup_logging()
    records = []
    handler = log.logger.add(lambda message: records.append(json.loads(message.record["extra"]["_json"])))
    DatabaseTask.bind(Celery("dependency-observation", broker="memory://"))
    task = DatabaseTask()

    def execute():
        task.push_request(
            id="database-task",
            retries=2,
            headers={"request_id": "database-request", "user_id": "subject", "correlation_id": "database-flow"},
        )
        try:
            return task()
        finally:
            task.pop_request()

    try:
        assert await asyncio.to_thread(execute) == 17
        assert any(row.get("operation") == "pool.acquire" for row in records)
        assert any(row.get("operation") == "query.select" for row in records)
        assert all(
            (row.get("task_id"), row.get("attempt"), row.get("correlation_id"), row.get("user_id"))
            == ("database-task", 2, "database-flow", "subject")
            for row in records
            if row.get("event") == "dependency.slow"
        )
    finally:
        log.logger.remove(handler)
