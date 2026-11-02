import asyncio
import io
import json
import sys
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

import pytest
from celery import Celery
from rapidkit_core import dependency_observation, log
from rapidkit_core.config import settings
from rapidkit_core.dependency_observation import record_dependency
from rapidkit_core.environment import Environment
from rapidkit_framework.identity import IdentityMetadata, current_identity, identity_scope
from src.queues.task import Task


def dependency():
    record_dependency("redis", "get", 0.01, ConnectionError("synthetic-private-task-secret"))
    return current_identity()


class SyncObservedTask(Task):
    name = "test.observed.sync"

    def run(self, fail=False):
        identity = dependency()
        if fail:
            raise ValueError("synthetic-private-task-secret")
        return identity


class AsyncObservedTask(Task):
    name = "test.observed.async"

    def _resolve_deps(self):
        dependency()
        return {"marker": True}

    async def run(self, marker, fail=False):
        assert marker
        identity = dependency()
        assert await asyncio.to_thread(dependency) == identity
        if fail:
            raise ValueError("synthetic-private-task-secret")
        return identity

    async def _cleanup_deps(self, deps):
        dependency()


app = Celery("task-log-context", broker="memory://")
SyncObservedTask.bind(app)
AsyncObservedTask.bind(app)


@pytest.fixture
def production_log(monkeypatch, tmp_path):
    # Exercise every propagation boundary independently of production sampling.
    monkeypatch.setattr(dependency_observation, "NOTICE_INTERVAL_SECONDS", 0)
    output = io.StringIO()
    monkeypatch.setattr(sys, "stdout", output)
    monkeypatch.setattr(settings, "ENVIRONMENT", Environment.PRODUCTION)
    monkeypatch.setattr(settings, "LOG_JSON", True)
    monkeypatch.setattr(log, "LOG_PATH", tmp_path)
    log.setup_logging()
    log.set_custom_logfile(enqueue=False)
    yield output, tmp_path
    log.complete_logging()
    for handler in log._owned_handlers:
        log.logger.remove(handler)
    log._owned_handlers.clear()


@pytest.mark.parametrize("task_type", [SyncObservedTask, AsyncObservedTask])
def test_actual_tasks_bind_real_delivery_context_and_restore_after_failure(task_type, production_log):
    task = task_type()
    outer = IdentityMetadata("outer-user", "outer-actor")
    with identity_scope(outer), log.logger.contextualize(task_id="outer-task", user_id="outer-user"):
        for number in (1, 2):
            task.push_request(
                id=f"task-{number}",
                retries=number,
                headers={
                    "request_id": "shared-request",
                    "audit_correlation_id": f"flow-{number}",
                    "correlation_id": "lower-priority",
                    "user_id": f"user-{number}",
                    "actor_id": f"actor-{number}",
                    "impersonation_session_id": f"session-{number}",
                    "private": "synthetic-private-task-secret",
                },
            )
            try:
                assert task() == IdentityMetadata(f"user-{number}", f"actor-{number}", f"session-{number}")
                with pytest.raises(ValueError, match="synthetic-private"):
                    task(fail=True)
            finally:
                task.pop_request()
            assert current_identity() == outer
        assert task() == IdentityMetadata()
        dependency()
    dependency()

    log.complete_logging()
    output, directory = production_log
    stdout = output.getvalue()
    files = "".join(path.read_text() for path in directory.glob("*.log"))
    assert "synthetic-private" not in stdout + files
    for text in (stdout, files):
        rows = [json.loads(line) for line in text.splitlines() if json.loads(line).get("event") == "dependency.failed"]
        for number in (1, 2):
            matching = [row for row in rows if row.get("task_id") == f"task-{number}"]
            assert len(matching) >= (8 if task_type is AsyncObservedTask else 2)
            assert all(
                (
                    row["request_id"],
                    row["task_name"],
                    row["attempt"],
                    row["correlation_id"],
                    row["user_id"],
                    row["actor_id"],
                    row["impersonation_session_id"],
                )
                == (
                    "shared-request",
                    task_type.name,
                    number,
                    f"flow-{number}",
                    f"user-{number}",
                    f"actor-{number}",
                    f"session-{number}",
                )
                for row in matching
            )
        assert any(
            row.get("task_id") is None and row.get("user_id") is None and row.get("attempt") == 0 for row in rows
        )
        assert rows[-2]["task_id"] == "outer-task" and rows[-2]["user_id"] == "outer-user"
        assert rows[-1].get("task_id") is None and rows[-1].get("user_id") is None


def test_concurrent_worker_threads_do_not_exchange_task_context(production_log):
    barrier = Barrier(2)

    class ParallelTask(Task):
        name = "test.parallel"

        def run(self):
            barrier.wait(timeout=5)
            return dependency()

    ParallelTask.bind(app)

    def execute(number):
        task = ParallelTask()
        task.push_request(id=f"parallel-{number}", headers={"request_id": "shared", "user_id": f"user-{number}"})
        try:
            return task()
        finally:
            task.pop_request()

    with ThreadPoolExecutor(max_workers=2) as executor:
        assert list(executor.map(execute, (1, 2))) == [IdentityMetadata("user-1"), IdentityMetadata("user-2")]
    output, _ = production_log
    rows = [json.loads(line) for line in output.getvalue().splitlines()]
    assert {(row.get("task_id"), row.get("user_id"), row.get("correlation_id")) for row in rows} == {
        ("parallel-1", "user-1", "shared"),
        ("parallel-2", "user-2", "shared"),
    }
