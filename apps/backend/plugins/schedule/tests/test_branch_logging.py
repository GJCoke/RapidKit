from datetime import UTC, datetime
from types import SimpleNamespace as NS
from unittest.mock import AsyncMock
from uuid import uuid4

from plugin_schedule.schedule_types import TaskType
from plugin_schedule.schemas import PeriodicTaskUpdate
from plugin_schedule.services import update_periodic_task
from plugin_schedule.solar import Solar
from tests.testing.utils import one_event


async def test_empty_update_noop(json_log):
    uid = uuid4()
    value = NS(id=uid, task_type=TaskType.INTERVAL, schedule_id=uuid4())
    crud = NS(get_locked=AsyncMock(return_value=value), get_with_schedule=AsyncMock(return_value=value))
    assert await update_periodic_task(crud, uid, PeriodicTaskUpdate()) is value
    row = one_event(json_log(), "schedule.task.noop")
    assert (row["level"], row["outcome"], row["reason_code"], row["resource_type"], row["resource_id"]) == (
        "INFO",
        "noop",
        "no_change",
        "periodic_task",
        str(uid),
    )
    assert not [r for r in json_log() if r.get("event") == "schedule.mutation.staged"]
    assert "private-" not in str(json_log())


def test_polar_solar_event_absent(json_log):
    now = datetime(2026, 12, 21, 12, tzinfo=UTC)
    solar = Solar("sunrise", 89, 0, nowfun=lambda: now)
    assert solar.remaining_estimate(now).total_seconds() > 0
    row = one_event(json_log(), "schedule.solar.skipped")
    assert (row["level"], row["outcome"], row["reason_code"], row["event_name"]) == (
        "INFO",
        "skipped",
        "solar_event_absent",
        "sunrise",
    )
    assert "private-" not in str(json_log())
