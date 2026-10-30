"""Worker operations statistics tests."""

from datetime import datetime, timedelta
import pytest

from plugin_worker.operations import is_worker_healthy, terminal_success_rate
from rapidkit_common.enums import WorkerStatus


@pytest.mark.asyncio
async def test_yesterday_comparison_uses_calendar_midnight_on_dst(monkeypatch):
    import plugin_worker.operations as module
    from datetime import date
    from unittest.mock import AsyncMock, MagicMock
    from rapidkit_core.timezone import TimeZone

    clock = TimeZone("Europe/Berlin")
    monkeypatch.setattr(module, "timezone", clock, raising=False)
    session = MagicMock()
    session.exec = AsyncMock(return_value=MagicMock(one=lambda: (0, 0)))
    factory = MagicMock()
    factory.return_value.__aenter__ = AsyncMock(return_value=session)
    factory.return_value.__aexit__ = AsyncMock(return_value=None)
    await module.WorkerOperationsProviderImpl(factory).get_task_comparison(
        clock.start_of_day(date(2026, 3, 30)),
        clock.start_of_day(date(2026, 3, 31)),
    )
    params = session.exec.call_args.args[0].compile().params.values()
    assert datetime(2026, 3, 28, 23) in params


def test_worker_at_heartbeat_boundary_is_healthy() -> None:
    now = datetime(2026, 9, 2, 8)
    assert is_worker_healthy(WorkerStatus.ONLINE, now - timedelta(seconds=60), now, 60)
    assert not is_worker_healthy(WorkerStatus.OFFLINE, now, now, 60)


def test_terminal_success_rate_ignores_non_terminal_counts() -> None:
    assert terminal_success_rate(success=1, failure=1, revoked=0) == 50.0
    assert terminal_success_rate(success=0, failure=0, revoked=0) is None
