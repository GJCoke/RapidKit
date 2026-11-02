import json


async def test_actual_task_session_uses_dependency_observation_and_keeps_result(monkeypatch):
    from rapidkit_core import log
    from rapidkit_core.config import settings
    from sqlalchemy import text
    from src.queues.deps import TaskSession
    from src.queues.task import Task

    class DatabaseTask(Task):
        async def run(self, session: TaskSession):
            async with session() as tx:
                return await tx.scalar(text("SELECT 17"))

    monkeypatch.setattr(settings, "DEPENDENCY_SLOW_THRESHOLD_MS", 0)
    log.setup_logging()
    records = []
    handler = log.logger.add(lambda message: records.append(json.loads(message.record["extra"]["_json"])))
    task = DatabaseTask()
    deps = task._resolve_deps()
    try:
        assert await task.run(**deps) == 17
        assert any(row.get("operation") == "pool.acquire" for row in records)
        assert any(row.get("operation") == "query.select" for row in records)
    finally:
        await task._cleanup_deps(deps)
        log.logger.remove(handler)
