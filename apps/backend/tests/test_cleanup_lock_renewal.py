"""Every singleton maintenance job must explicitly opt into lock renewal."""

from importlib import import_module
from unittest.mock import AsyncMock, MagicMock

import pytest


@pytest.mark.parametrize(
    "module,name,ttl",
    [
        ("src.sio.tasks", "cleanup_stale_online_users", 60),
        ("plugin_monitoring.tasks", "aggregate_api_metrics", 120),
        ("plugin_monitoring.tasks", "cleanup_old_api_metrics", 300),
        ("plugin_notification.tasks", "cleanup_notification_outbox", 60),
        ("plugin_notification.tasks", "publish_scheduled_notifications", 60),
        ("plugin_notification.tasks", "expire_notifications", 60),
    ],
)
async def test_singleton_jobs_enable_renewal_without_changing_ttl(module, name, ttl, monkeypatch):
    # Task modules initialize the app and must be imported within the running loop.
    tasks = import_module(module)
    lock = AsyncMock()
    lock.acquire.return_value = False
    constructor = MagicMock(return_value=lock)
    monkeypatch.setattr(tasks, "DistributedLock", constructor)
    args = [AsyncMock()] if name == "cleanup_stale_online_users" else [AsyncMock(), MagicMock()]
    await getattr(tasks, name).run(*args)
    constructor.assert_called_once_with(args[0], f"lock:{name}", ttl=ttl, auto_renew=True)
    lock.release.assert_not_awaited()
