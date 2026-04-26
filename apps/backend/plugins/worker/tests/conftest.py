"""plugin_worker test conftest."""

import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))
sys.modules.pop("tests", None)

_ENV_DEFAULTS = {
    "POSTGRESQL_ASYNC_SCHEME": "postgresql+asyncpg",
    "POSTGRESQL_SYNC_SCHEME": "postgresql+psycopg",
    "POSTGRESQL_USERNAME": "test",
    "POSTGRESQL_PASSWORD": "test",
    "POSTGRESQL_HOST": "localhost",
    "POSTGRESQL_PORT": "5432",
    "POSTGRESQL_DATABASE": "test",
    "REDIS_ROOT_PASSWORD": "test",
    "REDIS_HOST": "localhost",
    "MINIO_ROOT_USER": "test",
    "MINIO_ROOT_PASSWORD": "test1234",
    "CORS_ORIGINS": '["*"]',
    "CORS_HEADERS": '["*"]',
    "ENVIRONMENT": "TESTING",
    "ENABLE_CELERY_MONITOR": "true",
}

for key, value in _ENV_DEFAULTS.items():
    os.environ.setdefault(key, value)

from unittest.mock import MagicMock  # noqa: E402

import pytest  # noqa: E402
from tests.testing.fixtures import *  # noqa: E402, F401, F403


@pytest.fixture
def mock_celery_app(client):
    """Mock Celery app for testing worker/task APIs without a real broker.

    Patches ``app.state.celery_app`` on the running FastAPI application so that
    API endpoints that read ``request.app.state.celery_app`` receive the mock.
    """
    from src.main import app

    mock = MagicMock()
    mock.control = MagicMock()
    mock.control.ping = MagicMock(return_value=[{"celery@worker1": {"ok": "pong"}}])
    mock.control.broadcast = MagicMock()
    mock.control.pool_grow = MagicMock(return_value=[{"celery@worker1": {"ok": "pool will grow"}}])
    mock.control.pool_shrink = MagicMock(return_value=[{"celery@worker1": {"ok": "pool will shrink"}}])
    mock.control.add_consumer = MagicMock()
    mock.control.cancel_consumer = MagicMock()
    mock.control.inspect = MagicMock()
    mock.control.revoke = MagicMock()
    mock.send_task = MagicMock(return_value=MagicMock(id="mock-task-id"))
    mock.tasks = {"test.task": MagicMock(), "test.cron_task": MagicMock()}
    mock.loader = MagicMock()

    original = getattr(app.state, "celery_app", None)
    app.state.celery_app = mock
    yield mock
    if original is not None:
        app.state.celery_app = original
