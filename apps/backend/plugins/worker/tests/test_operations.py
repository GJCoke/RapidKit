"""Worker operations statistics tests."""

from datetime import datetime, timedelta

from plugin_worker.operations import is_worker_healthy, terminal_success_rate
from rapidkit_common.enums import WorkerStatus


def test_worker_at_heartbeat_boundary_is_healthy() -> None:
    now = datetime(2026, 9, 2, 8)
    assert is_worker_healthy(WorkerStatus.ONLINE, now - timedelta(seconds=60), now, 60)
    assert not is_worker_healthy(WorkerStatus.OFFLINE, now, now, 60)


def test_terminal_success_rate_ignores_non_terminal_counts() -> None:
    assert terminal_success_rate(success=1, failure=1, revoked=0) == 50.0
    assert terminal_success_rate(success=0, failure=0, revoked=0) is None
