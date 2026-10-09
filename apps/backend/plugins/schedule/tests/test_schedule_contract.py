"""Unified schedule contracts and persistence, without external services."""

from datetime import UTC, datetime

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from plugin_schedule.api import router
from plugin_schedule.crud import PeriodicTaskCRUD
from plugin_schedule.deps import get_periodic_task_crud
from plugin_schedule.models import CrontabSchedule, IntervalSchedule, PeriodicTask, SolarSchedule
from plugin_schedule.schedule_preview import preview_schedule
from plugin_schedule.schemas import (
    PeriodicTaskCreate,
    PeriodicTaskQueryRequest,
    PeriodicTaskUpdate,
    SchedulePreviewRequest,
)
from plugin_schedule.services import create_periodic_task, delete_periodic_task, update_periodic_task
from pydantic import ValidationError
from rapidkit_common.auth import verify_user_permission
from sqlalchemy.ext.asyncio import create_async_engine
from sqlmodel import SQLModel, select
from sqlmodel.ext.asyncio.session import AsyncSession


def test_discriminated_contract_rejects_mismatched_and_old_fields():
    for value in [
        {"type": "solar", "event": "sunrise", "latitude": 91, "longitude": 0},
        {"type": "solar", "event": "sunrise", "latitude": 0, "longitude": float("nan")},
        {"type": "interval", "every": 0, "period": "minutes"},
        {"type": "interval", "every": 1.5, "period": "minutes"},
        {"type": "crontab", "minute": "*/0"},
        {"type": "interval", "event": "sunrise"},
    ]:
        with pytest.raises(ValidationError):
            PeriodicTaskCreate(name="test", task="test.task", schedule=value)
    with pytest.raises(ValidationError):
        PeriodicTaskCreate(
            name="test", task="test.task", taskType="interval", interval={"every": 1, "period": "seconds"}
        )


@pytest.mark.asyncio
async def test_switches_all_three_types_preserves_arguments_and_cleans_old_records():
    engine = create_async_engine("sqlite+aiosqlite://")
    tables = [model.__table__ for model in [IntervalSchedule, CrontabSchedule, SolarSchedule, PeriodicTask]]
    async with engine.begin() as connection:
        await connection.run_sync(lambda conn: SQLModel.metadata.create_all(conn, tables=tables))
    try:
        async with AsyncSession(engine, expire_on_commit=False) as session:
            crud = PeriodicTaskCRUD(session)
            task = await create_periodic_task(
                crud,
                PeriodicTaskCreate(
                    name="types",
                    task="test.task",
                    args=[1, {"a": True}],
                    kwargs={"key": [2]},
                    schedule={"type": "interval", "every": 15, "period": "minutes"},
                ),
            )
            assert task.schedule.type == "interval"
            old_id = (await crud.get(task.id)).schedule_id
            solar = {"type": "solar", "event": "sunset", "latitude": 31.2304, "longitude": 121.4737}
            task = await update_periodic_task(crud, task.id, PeriodicTaskUpdate(schedule=solar))
            assert task.schedule.latitude == 31.2304
            assert await crud.interval_crud.get(old_id) is None
            solar_id = (await crud.get(task.id)).schedule_id
            task = await update_periodic_task(
                crud, task.id, PeriodicTaskUpdate(schedule={**solar, "latitude": -37.81753})
            )
            assert (await crud.get(task.id)).schedule_id == solar_id
            assert task.schedule.latitude == -37.81753
            page = await crud.get_paginate_tasks(PeriodicTaskQueryRequest())
            assert page.records[0].schedule.type == "solar"
            task = await update_periodic_task(
                crud, task.id, PeriodicTaskUpdate(schedule={"type": "crontab", "minute": "0"})
            )
            assert await crud.solar_crud.get(solar_id) is None
            assert task.args == [1, {"a": True}] and task.kwargs == {"key": [2]}
            assert task.schedule.minute == "0"
            await delete_periodic_task(crud, task.id)
            for model in [IntervalSchedule, CrontabSchedule, SolarSchedule, PeriodicTask]:
                assert (await session.exec(select(model))).all() == []
            await session.commit()
    finally:
        await engine.dispose()


def test_interval_preview_keeps_elapsed_time_and_subsecond_precision():
    start = datetime(2026, 10, 8, 1, 2, tzinfo=UTC)
    result = preview_schedule(
        SchedulePreviewRequest(schedule={"type": "interval", "every": 15, "period": "minutes"}), start=start
    )
    assert [run.minute for run in result.next_runs] == [17, 32, 47, 2, 17]
    result = preview_schedule(
        SchedulePreviewRequest(schedule={"type": "interval", "every": 1, "period": "microseconds"}), start=start
    )
    assert [run.microsecond for run in result.next_runs] == [1, 2, 3, 4, 5]
    assert len(set(result.model_dump(mode="json")["next_runs"])) == 5


@pytest.mark.parametrize(
    "event",
    [
        "sunrise",
        "sunset",
        "solar_noon",
        "dawn_civil",
        "dusk_civil",
        "dawn_nautical",
        "dusk_nautical",
        "dawn_astronomical",
        "dusk_astronomical",
    ],
)
def test_solar_preview_returns_real_ordered_events(event):
    result = preview_schedule(
        SchedulePreviewRequest(schedule={"type": "solar", "event": event, "latitude": 31.2304, "longitude": 121.4737}),
        start=datetime(2026, 10, 8, tzinfo=UTC),
    )
    assert result.valid and len(result.next_runs) == 5
    assert result.next_runs == sorted(set(result.next_runs))
    assert all(run > result.evaluated_at for run in result.next_runs)


def test_polar_preview_skips_check_times_and_beat_does_not_crash():
    start = datetime(2026, 6, 21, tzinfo=UTC)
    solar = {"type": "solar", "event": "sunrise", "latitude": 80.0, "longitude": 0.0}
    result = preview_schedule(SchedulePreviewRequest(schedule=solar), start=start)
    assert len(result.next_runs) == 5
    assert result.next_runs[0].month >= 8
    model = SolarSchedule.model_validate({"event": "sunrise", "latitude": 80, "longitude": 0})
    schedule = model.schedule
    schedule.nowfun = lambda: start
    assert schedule.remaining_estimate(start).total_seconds() > 0
    assert not schedule.is_due(datetime(2026, 6, 1, tzinfo=UTC)).is_due
    # A persisted last dispatch from before polar day must recover in autumn.
    schedule.nowfun = lambda: datetime(2026, 9, 1, 20, tzinfo=UTC)
    assert schedule.is_due(datetime(2026, 6, 1, tzinfo=UTC)).is_due


@pytest.mark.asyncio
async def test_unified_routes_round_trip_switch_types_and_validate_before_save():
    engine = create_async_engine("sqlite+aiosqlite://")
    async with engine.begin() as connection:
        await connection.run_sync(
            lambda conn: SQLModel.metadata.create_all(
                conn,
                tables=[model.__table__ for model in [IntervalSchedule, CrontabSchedule, SolarSchedule, PeriodicTask]],
            )
        )
    app = FastAPI()
    app.include_router(router)

    async def auth():
        return None

    async def crud_dependency():
        async with AsyncSession(engine, expire_on_commit=False) as session:
            yield PeriodicTaskCRUD(session)
            await session.commit()

    app.dependency_overrides[verify_user_permission] = auth
    app.dependency_overrides[get_periodic_task_crud] = crud_dependency
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.post(
                "/schedules",
                json={
                    "name": "api",
                    "task": "test.task",
                    "args": [1],
                    "kwargs": {"flag": True},
                    "schedule": {"type": "interval", "every": 60, "period": "seconds"},
                },
            )
            assert response.status_code == 200
            task_id = response.json()["data"]["id"]
            solar = {"type": "solar", "event": "sunrise", "latitude": -37.81753, "longitude": 144.96715}
            response = await client.put(f"/schedules/{task_id}", json={"schedule": solar})
            assert response.json()["data"]["schedule"] == solar
            response = await client.get("/schedules")
            assert response.json()["data"]["records"][0]["schedule"] == solar
            assert (await client.post("/schedules/preview", json={"schedule": solar})).json()["data"]["valid"]
            response = await client.post("/schedules/preview", json={"schedule": {"type": "crontab", "hour": "24"}})
            assert response.json()["data"]["errorField"] == "hour"
            response = await client.put(
                f"/schedules/{task_id}", json={"schedule": {"type": "crontab", "minute": "*/0"}}
            )
            assert response.status_code == 422
            response = await client.get(f"/schedules/{task_id}")
            assert response.json()["data"]["schedule"] == solar
            assert response.json()["data"]["args"] == [1]
            assert (await client.put(f"/schedules/{task_id}", json={"schedule": None})).status_code == 422
            assert (await client.delete(f"/schedules/{task_id}")).json()["data"] is True
    finally:
        await engine.dispose()
