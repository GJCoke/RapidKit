from unittest.mock import MagicMock

from rapidkit_framework.plugin import PluginLoadResult
from src.queues.app import app, configure_from_plugins


def test_plugin_tasks_are_imported_before_worker_task_registry_is_built() -> None:
    assert "plugin_auth.invite.tasks" in app.conf.imports

    app.loader.import_default_modules()

    assert "send_invite_email" in app.tasks


def test_celery_plugin_discovery_does_not_register_api_event_handlers(monkeypatch) -> None:
    discover = MagicMock(return_value=PluginLoadResult(plugins=[]))
    monkeypatch.setattr("rapidkit_framework.loader.discover_and_load_plugins", discover)

    configure_from_plugins()

    discover.assert_called_once_with(register_event_listeners=False)
