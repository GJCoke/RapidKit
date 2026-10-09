"""Task group queries verified against a real SQLite database."""

from datetime import datetime, timedelta

import pytest
import pytest_asyncio
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from plugin_worker.api import task_router
from plugin_worker.crud import TaskResultCRUD
from plugin_worker.deps import TaskResultCrudDep
from plugin_worker.models import CeleryTaskResult
from plugin_worker.schemas import TaskGroupQuery, TaskQueryRequest
from pydantic import ValidationError
from rapidkit_common.auth import verify_user_permission
from rapidkit_common.enums import TaskStatus
from sqlalchemy.ext.asyncio import create_async_engine
from sqlmodel.ext.asyncio.session import AsyncSession

START = datetime(2026, 10, 1)
END = START + timedelta(days=7)


@pytest_asyncio.fixture
async def task_crud():
    engine = create_async_engine("sqlite+aiosqlite://")
    async with engine.begin() as conn:
        await conn.run_sync(CeleryTaskResult.__table__.create)
    async with AsyncSession(engine) as session:
        yield TaskResultCRUD(session)
    await engine.dispose()


async def seed(crud, name, status=TaskStatus.SUCCESS, when=START, worker="worker", retries=0, runtime=2.0):
    task = CeleryTaskResult(
        task_id=f"{name}-{len(crud.session.new)}-{status}-{when}-{worker}",
        task_name=name,
        status=status,
        create_time=when,
        worker_hostname=worker,
        retries=retries,
        runtime=runtime,
    )
    crud.session.add(task)


@pytest.mark.asyncio
async def test_groups_pagination_and_retry_counts(task_crud):
    for i in range(12):
        await seed(task_crud, f"task.{i:02}", when=START + timedelta(hours=i))
    for status in (TaskStatus.FAILURE, TaskStatus.PENDING, TaskStatus.STARTED, TaskStatus.RETRY, TaskStatus.REVOKED):
        await seed(task_crud, "task.00", status=status, retries=7)
    await task_crud.session.flush()
    query = TaskGroupQuery(start_time=START, end_time=END, sort_by="total")
    page = await task_crud.get_stats_by_name(query)
    assert page.total == 12
    assert len(page.records) == 10
    row = page.records[0]
    assert (row.task_name, row.total, row.success, row.failure, row.in_progress) == ("task.00", 6, 1, 1, 3)
    assert row.success_rate == 50
    assert row.avg_runtime == 2
    second = await task_crud.get_stats_by_name(query.model_copy(update={"page": 2}))
    assert len(second.records) == 2
    assert set(r.task_name for r in page.records).isdisjoint(r.task_name for r in second.records)


@pytest.mark.asyncio
async def test_exact_drilldown_boundaries_and_literal_search(task_crud):
    await seed(task_crud, "task_%", TaskStatus.FAILURE)
    await seed(task_crud, "task_%", TaskStatus.RETRY, when=START + timedelta(hours=1))
    await seed(task_crud, "task_%", when=END)
    await seed(task_crud, "task_%", when=START - timedelta(seconds=1))
    await seed(task_crud, "task_AX", when=START)
    await seed(task_crud, "task_%suffix", when=START)
    await seed(task_crud, "task_%", worker="other")
    await task_crud.session.flush()
    groups = await task_crud.get_stats_by_name(
        TaskGroupQuery(start_time=START, end_time=END, task_name="_%", worker_hostname="worker")
    )
    assert groups.total == 2
    group = next(r for r in groups.records if r.task_name == "task_%")
    records = await task_crud.get_paginate_tasks(
        TaskQueryRequest(
            start_time=START, end_time=END, task_name="task_%", task_name_match="exact", worker_hostname="worker"
        )
    )
    assert records.total == group.total == 2
    failures = await task_crud.get_paginate_tasks(
        TaskQueryRequest(
            start_time=START,
            end_time=END,
            task_name="task_%",
            task_name_match="exact",
            worker_hostname="worker",
            status=TaskStatus.FAILURE,
        )
    )
    assert failures.total == group.failure == 1


@pytest.mark.asyncio
async def test_sorting_and_empty_success_rate(task_crud):
    await seed(task_crud, "early", TaskStatus.RETRY)
    await seed(task_crud, "late", TaskStatus.FAILURE, when=START + timedelta(days=1))
    await task_crud.session.flush()
    for key in ("lastExecutedAt", "failure", "total"):
        rows = await task_crud.get_stats_by_name(
            TaskGroupQuery(start_time=START, end_time=END, sort_by=key, sort_order="asc")
        )
        assert rows.records[0].task_name == "early"
    assert rows.records[0].success_rate is None
    rows = await task_crud.get_stats_by_name(TaskGroupQuery(start_time=START, end_time=END))
    assert rows.records[0].task_name == "late"


@pytest.mark.parametrize("schema", [TaskGroupQuery, TaskQueryRequest])
@pytest.mark.parametrize(
    "params",
    [
        {"startTime": START},
        {"endTime": END},
        {"startTime": END, "endTime": START},
        {"startTime": START, "endTime": START},
        {"startTime": START, "endTime": START + timedelta(days=91)},
    ],
)
def test_invalid_time_ranges(schema, params):
    with pytest.raises(ValidationError):
        schema.model_validate(params)


@pytest.mark.parametrize("schema", [TaskGroupQuery, TaskQueryRequest])
def test_utc_normalization_and_default_range(schema):
    query = schema(startTime="2026-10-01T08:00:00+08:00", endTime="2026-10-08T08:00:00+08:00")
    assert query.start_time == START
    assert query.end_time == END
    default = schema()
    assert default.end_time - default.start_time == timedelta(days=7)


@pytest.mark.asyncio
async def test_group_api_contract(task_crud):
    await seed(task_crud, "task.api")
    await task_crud.session.flush()
    app = FastAPI()
    app.include_router(task_router)
    app.dependency_overrides[verify_user_permission] = lambda: None
    app.dependency_overrides[TaskResultCrudDep.__metadata__[0].dependency] = lambda: task_crud
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get(
            "/tasks/stats/by-name",
            params={
                "startTime": START.isoformat(),
                "endTime": END.isoformat(),
                "pageSize": 1,
            },
        )
        assert response.status_code == 200
        data = response.json()["data"]
        assert data["total"] == 1
        assert data["records"][0]["taskName"] == "task.api"
        assert data["records"][0]["inProgress"] == 0
        assert data["records"][0]["successRate"] == 100
        for route in ("/tasks", "/tasks/stats/by-name"):
            response = await client.get(route, params={"startTime": START.isoformat()})
            assert response.status_code == 422
        response = await client.get("/tasks/stats/by-name", params={"sortBy": "invalid"})
        assert response.status_code == 422
