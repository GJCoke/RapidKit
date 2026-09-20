from typing import Protocol
from unittest.mock import MagicMock

from rapidkit_framework.plugin import PluginLoadResult, PluginManifest
from rapidkit_framework.services import get_service, service_registry
from src.queues.app import app, configure_from_plugins


class _WorkerService(Protocol):
    def value(self) -> str: ...


class _WorkerServiceImpl:
    def value(self) -> str:
        return "registered"


def test_plugin_tasks_are_imported_before_worker_task_registry_is_built() -> None:
    assert "plugin_auth.invite.tasks" in app.conf.imports

    app.loader.import_default_modules()

    assert "send_invite_email" in app.tasks


def test_celery_plugin_discovery_does_not_register_api_event_handlers(monkeypatch) -> None:
    discover = MagicMock(return_value=PluginLoadResult(plugins=[]))
    monkeypatch.setattr("rapidkit_framework.loader.discover_and_load_plugins", discover)

    configure_from_plugins()

    discover.assert_called_once_with(register_event_listeners=False)


def test_celery_plugin_discovery_registers_runtime_services(monkeypatch) -> None:
    def register_services(registry) -> None:
        registry.register(_WorkerService, _WorkerServiceImpl())

    manifest = PluginManifest(
        name="worker-service-provider",
        version="0.1.0",
        provides=[_WorkerService],
        service_factories={_WorkerService: register_services},
    )
    monkeypatch.setattr(
        "rapidkit_framework.loader.discover_and_load_plugins",
        MagicMock(return_value=PluginLoadResult(plugins=[manifest])),
    )
    service_registry.clear()

    try:
        configure_from_plugins()

        assert get_service(_WorkerService).value() == "registered"
    finally:
        service_registry.clear()
