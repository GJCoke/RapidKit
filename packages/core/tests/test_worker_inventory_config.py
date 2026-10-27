"""Managed worker identities survive Docker container replacement."""

import json
import re
from pathlib import Path

import pytest
from pydantic import ValidationError
from rapidkit_core.config import CeleryConfigMixin


def config(**values):
    return CeleryConfigMixin(_env_file=None, REDIS_HOST="localhost", REDIS_ROOT_PASSWORD="test", **values)


def test_default_uses_worker_discovery():
    assert config().CELERY_WORKER_NAMES == []


def test_managed_roster_preserves_distinct_names():
    assert config(CELERY_WORKER_NAMES=["celery@node1", "celery@node2"]).CELERY_WORKER_NAMES == [
        "celery@node1",
        "celery@node2",
    ]


@pytest.mark.parametrize("names", [[""], ["  "], ["node", "node"], [" celery@node "]])
def test_invalid_worker_names_are_rejected(names):
    with pytest.raises(ValidationError):
        config(CELERY_WORKER_NAMES=names)


def test_compose_workers_use_unique_boot_identity_and_declarative_capacity():
    root = Path(__file__).resolve().parents[3]
    compose = (root / "docker/prod/docker-compose.yml").read_text()
    worker = re.search(r"^  celery-worker:\n(.*?)(?=^  [a-z]|\Z)", compose, re.MULTILINE | re.DOTALL).group(1)
    command = json.loads(re.search(r"^    command: (\[.*\])$", worker, re.MULTILINE).group(1))
    assert command == ["python", "-m", "plugin_worker.launcher"]
    assert "replicas: ${CELERY_WORKER_REPLICAS:-1}" in worker
    assert "CELERY_WORKER_GROUP: ${CELERY_WORKER_GROUP:-prod/default}" in worker
    for service in ("backend-api", "celery-worker", "celery-beat"):
        block = re.search(rf"^  {service}:\n(.*?)(?=^  [a-z]|\Z)", compose, re.MULTILINE | re.DOTALL).group(1)
        assert "CELERY_WORKER_NAMES:" not in block
        if service != "celery-beat":
            assert "container_name:" not in block
