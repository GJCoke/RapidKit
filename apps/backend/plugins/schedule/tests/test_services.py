"""Service transaction failure and patch behavior."""

from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
from plugin_schedule.schedule_types import TaskType
from plugin_schedule.schemas import PeriodicTaskUpdate
from plugin_schedule.services import update_periodic_task


def mock_crud():
    crud = AsyncMock()
    crud.schedule_crud = MagicMock()
    configs = {kind: AsyncMock() for kind in TaskType}
    crud.schedule_crud.side_effect = configs.__getitem__
    task = MagicMock(id=uuid4(), task_type=TaskType.INTERVAL, schedule_id=uuid4())
    crud.get_locked.return_value = task
    return crud, configs, task


@pytest.mark.asyncio
async def test_name_only_patch_does_not_touch_schedule():
    crud, configs, task = mock_crud()
    await update_periodic_task(crud, task.id, PeriodicTaskUpdate(name="renamed"))
    crud.update_by_id.assert_awaited_once_with(task.id, {"name": "renamed"})
    crud.schedule_crud.assert_not_called()


@pytest.mark.asyncio
async def test_failed_type_switch_does_not_delete_old_configuration():
    crud, configs, task = mock_crud()
    crud.update_by_id.side_effect = RuntimeError("database error")
    with pytest.raises(RuntimeError):
        await update_periodic_task(
            crud,
            task.id,
            PeriodicTaskUpdate(
                schedule={
                    "type": "solar",
                    "event": "sunrise",
                    "latitude": 31.2304,
                    "longitude": 121.4737,
                }
            ),
        )
    configs[TaskType.INTERVAL].delete.assert_not_awaited()
