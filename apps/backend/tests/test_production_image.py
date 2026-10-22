"""Run the actual production image; selected only by the image CI job."""

import json
import os
import subprocess
import time
from uuid import uuid4

import pytest

pytestmark = pytest.mark.docker

IMAGE = os.environ.get("RAPIDKIT_TEST_IMAGE", "rapidkit-backend:prod")
ENV = {
    "ENVIRONMENT": "TESTING",
    "POSTGRESQL_ASYNC_SCHEME": "postgresql+asyncpg",
    "POSTGRESQL_SYNC_SCHEME": "postgresql+psycopg",
    "POSTGRESQL_USERNAME": "test",
    "POSTGRESQL_PASSWORD": "test",
    "POSTGRESQL_HOST": "localhost",
    "POSTGRESQL_PORT": "5432",
    "POSTGRESQL_DATABASE": "test",
    "REDIS_ROOT_PASSWORD": "",
    "REDIS_HOST": "localhost",
    "MINIO_ROOT_USER": "test",
    "MINIO_ROOT_PASSWORD": "test1234",
    "CORS_ORIGINS": '["*"]',
    "CORS_HEADERS": '["*"]',
}


def run_image(*command: str, env: dict[str, str] | None = None, network: str | None = None) -> str:
    args = ["docker", "run", "--pull=never", "--rm"]
    if network is not None:
        args.extend(["--network", network])
    for key, value in (ENV | (env or {})).items():
        args.extend(["-e", f"{key}={value}"])
    result = subprocess.run([*args, IMAGE, *command], capture_output=True, text=True, timeout=120)
    assert result.returncode == 0, result.stderr
    return result.stdout


def test_prod_image_contains_workspace_and_runs_unprivileged():
    output = run_image(
        "python",
        "-c",
        "import importlib, importlib.metadata, json, os; "
        "from pathlib import Path; assert not list(Path('/app/apps/backend').glob('.env*')); "
        "[importlib.import_module(name) for name in "
        "('rapidkit_core','rapidkit_common','rapidkit_framework','rapidkit_security')]; "
        "entries = importlib.metadata.entry_points(group='rapidkit.plugins'); "
        "[entry.load() for entry in entries]; "
        "print(json.dumps({'uid': os.getuid(), 'plugins': sorted(entry.name for entry in entries), "
        "'has_pytest': importlib.util.find_spec('pytest') is not None}))",
    )
    info = json.loads(output.splitlines()[-1])
    assert info["uid"] != 0
    assert info["has_pytest"] is False
    assert info["plugins"] == [
        "auth",
        "department",
        "menu",
        "monitoring",
        "notification",
        "permission",
        "schedule",
        "system",
        "user",
        "worker",
    ]
    heads = run_image("alembic", "heads")
    assert {line.split()[0] for line in heads.splitlines() if "(head)" in line or "(effective head)" in line} == {
        "f372013a5ff8",
        "8883f430faa0",
        "7890f03ca421",
        "5528642834cd",
        "adc6180c8b58",
        "f3e195087ecb",
        "dba3793bddc9",
        "0b3f9c589da5",
        "21bde89c427a",
        "3516a8ad1a50",
    }


def test_prod_image_migrates_empty_database_without_model_drift():
    name = f"rapidkit-image-test-{uuid4().hex[:12]}"
    subprocess.run(["docker", "network", "create", name], check=True, capture_output=True)
    try:
        subprocess.run(
            [
                "docker",
                "run",
                "--rm",
                "-d",
                "--name",
                name,
                "--network",
                name,
                "-e",
                "POSTGRES_USER=test",
                "-e",
                "POSTGRES_PASSWORD=test",
                "-e",
                "POSTGRES_DB=test",
                "postgres:16-alpine",
            ],
            check=True,
            capture_output=True,
        )
        deadline = time.monotonic() + 30
        while True:
            ready = subprocess.run(["docker", "exec", name, "pg_isready", "-U", "test"], capture_output=True)
            if ready.returncode == 0:
                break
            assert time.monotonic() < deadline, "Test PostgreSQL did not become ready"
            time.sleep(0.2)
        env = {"POSTGRESQL_HOST": name}
        for _ in range(2):
            run_image("sh", "scripts/alembic/migrate.sh", env=env, network=name)
        assert "No new upgrade operations detected" in run_image("alembic", "check", env=env, network=name)
    finally:
        subprocess.run(["docker", "rm", "-f", "-v", name], capture_output=True)
        subprocess.run(["docker", "network", "rm", name], capture_output=True)
