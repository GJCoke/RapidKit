import json
import time
from collections.abc import Callable
from types import SimpleNamespace
from typing import cast

from prometheus_client import CollectorRegistry, generate_latest
from sqlalchemy.ext.asyncio import async_sessionmaker
from sqlmodel.ext.asyncio.session import AsyncSession
from src.queues.consumer import _ensure_consumer_group


async def test_single_sampler_keeps_unknown_separate_from_healthy_zero(session, pg_engine, redis, tmp_path):
    from src.ops.exporter import OperationalSampler

    await _ensure_consumer_group(redis)
    inventory = tmp_path / "inventory.json"
    inventory.write_text(json.dumps({"updated_at": time.time(), "instances": {}}))
    sampler = OperationalSampler(redis, async_sessionmaker(pg_engine, class_=AsyncSession), inventory, tmp_path, 1000)
    await sampler.sample()
    registry = CollectorRegistry()
    registry.register(sampler)
    healthy = generate_latest(registry).decode()
    assert 'rapidkit_ops_sample_success{component="events"} 1.0' in healthy
    assert "rapidkit_events_pending 0.0" in healthy
    await redis.xadd("celery:events:dead", {"reason_code": "synthetic"})
    await sampler.sample()
    assert "rapidkit_events_dead 1.0" in generate_latest(registry).decode()

    async def failed_ping():
        raise ConnectionError("private-redis-value")

    sampler.redis = SimpleNamespace(ping=failed_ping)
    await sampler.sample()
    unavailable = generate_latest(registry).decode()
    assert 'rapidkit_dependency_up{component="redis"} 0.0' in unavailable
    assert 'rapidkit_ops_sample_success{component="events"} 0.0' in unavailable
    assert "rapidkit_events_dead 1.0" in unavailable
    assert "private-" not in unavailable


async def test_automatic_retention_is_opt_in_and_runs_at_most_hourly(pg_engine, redis, tmp_path, monkeypatch):
    from plugin_worker import retention
    from rapidkit_core.config import settings
    from src.ops.exporter import OperationalSampler

    calls = []

    async def prune(session, client, *, days, apply):
        calls.append((days, apply))
        return 3

    monkeypatch.setattr(retention, "prune_results", prune)
    sampler = OperationalSampler(redis, async_sessionmaker(pg_engine, class_=AsyncSession), tmp_path, tmp_path, 1000)
    monkeypatch.setattr(settings, "TASK_RESULT_RETENTION_DAYS", None)
    await sampler._sample("retention", sampler._retention)
    assert sampler.values["retention"] == {"task_retention_enabled": 0} and not calls
    monkeypatch.setattr(settings, "TASK_RESULT_RETENTION_DAYS", 30)
    await sampler._sample("retention", sampler._retention)
    await sampler._sample("retention", sampler._retention)
    assert calls == [(30, True)]
    assert sampler.values["retention"]["task_retention_last_deleted"] == 3
    sampler.last_retention -= 3601
    await sampler._sample("retention", sampler._retention)
    assert len(calls) == 2


async def test_complete_default_config_preserves_old_results_until_explicit_opt_in(
    session, pg_engine, redis, tmp_path, monkeypatch
):
    from datetime import timedelta

    from plugin_worker.models import CeleryTaskResult, TaskReceipt
    from plugin_worker.retention import prune_results
    from rapidkit_common.enums import TaskStatus
    from rapidkit_core.config import Config
    from rapidkit_core.timezone import timezone
    from sqlmodel import select
    from src.ops import exporter

    monkeypatch.delenv("TASK_RESULT_RETENTION_DAYS", raising=False)
    config_factory = cast(Callable[..., Config], Config)
    default_config = config_factory(_env_file=None)
    assert default_config.TASK_RESULT_RETENTION_DAYS is None
    monkeypatch.setattr(exporter, "settings", default_config)
    await _ensure_consumer_group(redis)
    session.add(
        CeleryTaskResult(
            task_id="default-retained",
            task_name="demo",
            status=TaskStatus.SUCCESS,
            finished_at=timezone.now() - timedelta(days=40),
        )
    )
    await session.commit()
    sampler = exporter.OperationalSampler(
        redis, async_sessionmaker(pg_engine, class_=AsyncSession), tmp_path, tmp_path, 1000
    )
    assert await sampler._retention() == {"task_retention_enabled": 0}
    assert await prune_results(session, redis, days=30) == 1
    assert (await session.exec(select(CeleryTaskResult))).one().task_id == "default-retained"
    assert (await session.exec(select(TaskReceipt))).first() is None
    await session.rollback()

    monkeypatch.setattr(exporter, "settings", config_factory(_env_file=None, TASK_RESULT_RETENTION_DAYS=30))
    assert (await sampler._retention())["task_retention_last_deleted"] == 1
    assert (await session.exec(select(CeleryTaskResult))).first() is None
    assert (await session.exec(select(TaskReceipt))).one().task_id == "default-retained"
