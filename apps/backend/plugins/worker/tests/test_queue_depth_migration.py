"""Queue-depth schema repair preserves existing worker monitoring data."""

from datetime import UTC, datetime
from importlib import import_module
from pathlib import Path
from unittest.mock import AsyncMock

import pytest
import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations
from alembic.script import ScriptDirectory
from plugin_worker.models import CeleryTaskResult, CeleryWorker, QueueDepthSnapshot
from plugin_worker.tasks import capture_queue_depth
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlmodel import SQLModel, select
from sqlmodel.ext.asyncio.session import AsyncSession


def worker_head():
    versions = Path(__file__).resolve().parents[1] / "migrations" / "versions"
    script = ScriptDirectory(str(versions.parent), version_locations=[str(versions)])
    return script.get_revision("worker@head").module


def repair(connection):
    with Operations.context(MigrationContext.configure(connection)):
        worker_head().upgrade()


def test_repair_adds_missing_snapshot_table_without_recreating_existing_tables():
    engine = sa.create_engine("sqlite://")
    try:
        with engine.begin() as connection:
            SQLModel.metadata.create_all(connection, tables=[CeleryWorker.__table__, CeleryTaskResult.__table__])
            worker = CeleryWorker(hostname="existing-worker")
            task = CeleryTaskResult(task_id="existing-task", task_name="schedule_test")
            connection.execute(CeleryWorker.__table__.insert().values(**worker.model_dump()))
            connection.execute(CeleryTaskResult.__table__.insert().values(**task.model_dump()))
            repair(connection)
            repair(connection)
            assert connection.execute(sa.select(CeleryWorker.hostname)).scalars().all() == ["existing-worker"]
            assert connection.execute(sa.select(CeleryTaskResult.task_id)).scalars().all() == ["existing-task"]
            assert sa.inspect(connection).has_table("worker_queue_depth_snapshots")
            indexes = {index["name"] for index in sa.inspect(connection).get_indexes("worker_queue_depth_snapshots")}
            assert "ix_worker_queue_depth_snapshots_sampled_at" in indexes
    finally:
        engine.dispose()


def test_repair_and_downgrade_preserve_table_already_owned_by_initial_migration():
    engine = sa.create_engine("sqlite://")
    try:
        with engine.begin() as connection, Operations.context(MigrationContext.configure(connection)):
            import_module("plugins.worker.migrations.versions.453adcbe32a4_init").upgrade()
            snapshot = QueueDepthSnapshot(depth=4)
            connection.execute(QueueDepthSnapshot.__table__.insert().values(**snapshot.model_dump()))
            worker_head().upgrade()
            worker_head().downgrade()
            assert connection.execute(sa.select(QueueDepthSnapshot.depth)).scalars().all() == [4]
    finally:
        engine.dispose()


@pytest.mark.asyncio
async def test_capture_queue_depth_writes_real_snapshot_after_legacy_schema_repair():
    engine = create_async_engine("sqlite+aiosqlite://")
    try:
        async with engine.begin() as connection:
            await connection.run_sync(
                lambda conn: SQLModel.metadata.create_all(
                    conn, tables=[CeleryWorker.__table__, CeleryTaskResult.__table__]
                )
            )
            await connection.run_sync(repair)
        sessions = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
        async with sessions() as session:
            session.add(CeleryWorker(hostname="worker", active_queues=["celery", "priority"]))
            await session.commit()
        redis = AsyncMock()
        redis.llen.side_effect = lambda queue: {"celery": 2, "priority": 3}[queue]
        await capture_queue_depth(redis, sessions)
        async with sessions() as session:
            snapshots = (await session.exec(select(QueueDepthSnapshot))).all()
            assert len(snapshots) == 1
            assert snapshots[0].depth == 5
            assert snapshots[0].sampled_at <= datetime.now(UTC).replace(tzinfo=None)
    finally:
        await engine.dispose()
