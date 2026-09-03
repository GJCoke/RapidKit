"""Worker periodic task tests."""

from unittest.mock import AsyncMock, MagicMock

import pytest
from plugin_worker.models import CeleryWorker, QueueDepthSnapshot
from plugin_worker.tasks import capture_queue_depth


@pytest.mark.asyncio
async def test_capture_queue_depth_sums_active_queues_and_persists_snapshot() -> None:
    worker = CeleryWorker(hostname="worker-1", active_queues=["priority", "celery"])
    query_result = MagicMock()
    query_result.scalars.return_value.all.return_value = [worker]

    session = MagicMock()
    session.execute = AsyncMock(return_value=query_result)
    session.commit = AsyncMock()
    session_factory = MagicMock()
    session_factory.return_value.__aenter__ = AsyncMock(return_value=session)
    session_factory.return_value.__aexit__ = AsyncMock(return_value=None)

    queue_depths = {"celery": 2, "priority": 3}
    redis = MagicMock()
    redis.llen = AsyncMock(side_effect=lambda queue: queue_depths[queue])

    await capture_queue_depth(redis, session_factory)

    assert {call.args[0] for call in redis.llen.await_args_list} == {"celery", "priority"}
    snapshot = session.add.call_args.args[0]
    assert isinstance(snapshot, QueueDepthSnapshot)
    assert snapshot.depth == 5
    session.commit.assert_awaited_once_with()
