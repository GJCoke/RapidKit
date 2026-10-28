"""Exercise deployment orchestration without a Docker daemon."""

import ast
import importlib.util
import subprocess
from pathlib import Path

import pytest

spec = importlib.util.spec_from_file_location("worker_deploy", Path(__file__).parents[1] / "prod/deploy-backend.py")
deploy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(deploy)


def config():
    return {
        "services": {
            "celery-worker": {
                "environment": {"CELERY_WORKER_GROUP": "prod/default"},
                "deploy": {"replicas": 3},
                "command": ["python", "-m", "plugin_worker.launcher"],
            }
        }
    }


def test_replica_count_and_group_are_shared_between_intent_and_compose():
    calls = []
    deploy.deploy(["docker", "compose"], config(), ["celery-worker"], "release", calls.append)
    prepare = next(c for c in calls if "prepare" in c)
    replace = next(c for c in calls if "--force-recreate" in c)
    finish = next(c for c in calls if "finish" in c)
    assert prepare[-6:] == ["--group", "prod/default", "--deployment", "release", "--replicas", "3"]
    assert "celery-worker=3" in replace
    assert calls.index(prepare) < calls.index(replace) < calls.index(finish)
    assert "--no-deps" in replace


def test_replacement_failure_aborts_pending_intent_and_propagates_error():
    calls = []

    def run(command):
        calls.append(command)
        if "--force-recreate" in command:
            raise subprocess.CalledProcessError(1, command)

    with pytest.raises(subprocess.CalledProcessError):
        deploy.deploy(["docker", "compose"], config(), ["celery-worker"], "release", run)
    assert "abort" in calls[-1]
    assert not any("finish" in c for c in calls)


def test_invalid_config_is_rejected_before_any_mutation():
    data = config()
    data["services"]["celery-worker"]["deploy"]["replicas"] = -1
    calls = []
    with pytest.raises(ValueError):
        deploy.deploy(["docker", "compose"], data, ["celery-worker"], "release", calls.append)
    assert calls == []


def test_host_entrypoint_supports_python_310_syntax():
    ast.parse(Path(spec.origin).read_text(), feature_version=(3, 10))


def test_workers_only_does_not_migrate_or_recreate_api_and_beat():
    calls = []
    deploy.deploy(["docker", "compose"], config(), ["celery-worker"], "release", calls.append, initialize=False)
    assert not any("backend-migrate" in command for command in calls)
    assert not any(command[2:4] == ["up", "-d"] and "backend-api" in command for command in calls)
    assert any("prepare" in command for command in calls)
    assert any("finish" in command for command in calls)


def test_managed_release_cannot_be_updated_through_legacy_full_deployment():
    import json

    managed = json.dumps([{"Config": {"Labels": {"io.rapidkit.release-managed": "true"}}}])
    with pytest.raises(ValueError, match="release"):
        deploy.check_manual_mode(managed)
    deploy.check_manual_mode("[]")
