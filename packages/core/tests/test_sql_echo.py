import pytest
from rapidkit_core import database
from rapidkit_core.config import settings
from rapidkit_core.environment import Environment


@pytest.mark.parametrize("environment", list(Environment))
async def test_both_engine_factories_default_to_no_sql_echo(monkeypatch, environment):
    monkeypatch.setattr(settings, "ENVIRONMENT", environment)
    monkeypatch.setattr(database, "_async_engine_instance", None)
    monkeypatch.setattr(database, "_sync_engine_instance", None)
    asynchronous, synchronous = database.get_async_engine(), database.get_sync_engine()
    try:
        assert asynchronous.echo is False and synchronous.echo is False
    finally:
        await asynchronous.dispose()
        synchronous.dispose()


@pytest.mark.parametrize("environment,expected", [(Environment.LOCAL, True), (Environment.PRODUCTION, False)])
async def test_sql_echo_requires_explicit_nonproduction_opt_in(monkeypatch, environment, expected):
    monkeypatch.setattr(settings, "ENVIRONMENT", environment)
    monkeypatch.setattr(settings, "SQL_ECHO", True)
    monkeypatch.setattr(database, "_async_engine_instance", None)
    monkeypatch.setattr(database, "_sync_engine_instance", None)
    asynchronous, synchronous = database.get_async_engine(), database.get_sync_engine()
    try:
        assert asynchronous.echo is expected and synchronous.echo is expected
        assert asynchronous.sync_engine.hide_parameters and synchronous.hide_parameters
    finally:
        await asynchronous.dispose()
        synchronous.dispose()
