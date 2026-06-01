"""Unit tests for schedule service functions."""

from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from plugin_schedule.services import create_periodic_task, delete_periodic_task, update_periodic_task


class TestCreatePeriodicTask:
    @pytest.mark.asyncio
    async def test_interval_task_creation(self):
        from plugin_schedule.schedule_types import TaskType

        crud = AsyncMock()
        interval_schedule = MagicMock(id=uuid4())
        crud.interval_crud.create.return_value = interval_schedule
        created_task = MagicMock(id=uuid4())
        crud.create.return_value = created_task
        crud.get_with_schedule.return_value = MagicMock()

        body = MagicMock()
        body.task_type = TaskType.INTERVAL
        body.interval = MagicMock()
        body.crontab = None
        body.model_dump.return_value = {"task": "my_task", "task_type": "interval"}
        body.name = "my_task"

        await create_periodic_task(crud, body)

        crud.interval_crud.create.assert_called_once_with(body.interval)
        crud.create.assert_called_once()
        crud.get_with_schedule.assert_called_once_with(created_task.id)

    @pytest.mark.asyncio
    async def test_crontab_task_creation(self):
        from plugin_schedule.schedule_types import TaskType

        crud = AsyncMock()
        crontab_schedule = MagicMock(id=uuid4())
        crud.crontab_crud.create.return_value = crontab_schedule
        created_task = MagicMock(id=uuid4())
        crud.create.return_value = created_task
        crud.get_with_schedule.return_value = MagicMock()

        body = MagicMock()
        body.task_type = TaskType.CRONTAB
        body.interval = None
        body.crontab = MagicMock()
        body.model_dump.return_value = {"task": "my_task", "task_type": "crontab"}
        body.name = "my_task"

        await create_periodic_task(crud, body)

        crud.crontab_crud.create.assert_called_once_with(body.crontab)

    @pytest.mark.asyncio
    async def test_interval_without_data_raises(self):
        from rapidkit_framework.exceptions import AppException

        from plugin_schedule.schedule_types import TaskType

        crud = AsyncMock()
        body = MagicMock()
        body.task_type = TaskType.INTERVAL
        body.interval = None

        with pytest.raises(AppException):
            await create_periodic_task(crud, body)

    @pytest.mark.asyncio
    async def test_crontab_without_data_raises(self):
        from rapidkit_framework.exceptions import AppException

        from plugin_schedule.schedule_types import TaskType

        crud = AsyncMock()
        body = MagicMock()
        body.task_type = TaskType.CRONTAB
        body.crontab = None

        with pytest.raises(AppException):
            await create_periodic_task(crud, body)

    @pytest.mark.asyncio
    async def test_unsupported_type_raises(self):
        from rapidkit_framework.exceptions import AppException

        crud = AsyncMock()
        body = MagicMock()
        body.task_type = "clocked"
        body.interval = None
        body.crontab = None

        with pytest.raises(AppException):
            await create_periodic_task(crud, body)


class TestUpdatePeriodicTask:
    @pytest.mark.asyncio
    async def test_update_interval_schedule(self):
        from plugin_schedule.schedule_types import TaskType

        crud = AsyncMock()
        task = MagicMock()
        task.id = uuid4()
        task.task_type = TaskType.INTERVAL
        task.schedule_id = uuid4()
        crud.get.return_value = task
        crud.get_with_schedule.return_value = MagicMock()

        body = MagicMock()
        body.interval = MagicMock()
        body.crontab = None
        body.model_dump.return_value = {"name": "updated"}

        schedule_id = uuid4()
        await update_periodic_task(crud, schedule_id, body)

        crud.interval_crud.update_by_id.assert_called_once_with(task.schedule_id, body.interval)
        crud.update_by_id.assert_called_once_with(task.id, {"name": "updated"})

    @pytest.mark.asyncio
    async def test_update_with_no_task_data(self):
        from plugin_schedule.schedule_types import TaskType

        crud = AsyncMock()
        task = MagicMock()
        task.id = uuid4()
        task.task_type = TaskType.INTERVAL
        task.schedule_id = uuid4()
        crud.get.return_value = task
        crud.get_with_schedule.return_value = MagicMock()

        body = MagicMock()
        body.interval = MagicMock()
        body.crontab = None
        body.model_dump.return_value = {}

        schedule_id = uuid4()
        await update_periodic_task(crud, schedule_id, body)

        crud.update_by_id.assert_not_called()


class TestDeletePeriodicTask:
    @pytest.mark.asyncio
    async def test_delete_interval_task(self):
        from plugin_schedule.schedule_types import TaskType

        crud = AsyncMock()
        task = MagicMock()
        task.task_type = TaskType.INTERVAL
        task.schedule_id = uuid4()
        task.name = "my_task"
        crud.get.return_value = task

        schedule_id = uuid4()
        await delete_periodic_task(crud, schedule_id)

        crud.interval_crud.delete.assert_called_once_with(task.schedule_id)
        crud.delete.assert_called_once_with(schedule_id)

    @pytest.mark.asyncio
    async def test_delete_crontab_task(self):
        from plugin_schedule.schedule_types import TaskType

        crud = AsyncMock()
        task = MagicMock()
        task.task_type = TaskType.CRONTAB
        task.schedule_id = uuid4()
        task.name = "my_task"
        crud.get.return_value = task

        schedule_id = uuid4()
        await delete_periodic_task(crud, schedule_id)

        crud.crontab_crud.delete.assert_called_once_with(task.schedule_id)
        crud.delete.assert_called_once_with(schedule_id)
