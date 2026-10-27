"""Exercise real example hooks; replace external command execution only."""

import importlib.util
import json
import sys
from pathlib import Path

import pytest

EXAMPLES = Path(__file__).parents[1] / "examples/aliyun"


@pytest.fixture
def load(monkeypatch, tmp_path):
    monkeypatch.syspath_prepend(str(EXAMPLES))

    def module(name):
        spec = importlib.util.spec_from_file_location(f"example_{name}", EXAMPLES / f"{name}.py")
        loaded = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(loaded)
        return loaded

    return module


def context(tmp_path):
    bundle = tmp_path / "bundle"
    work = tmp_path / "work"
    bundle.mkdir()
    work.mkdir()
    return {"version": 1, "release_id": "r1", "bundle": str(bundle), "work_dir": str(work),
            "root": str(tmp_path / "target"), "options": {}, "results": {},
            "manifest": {"release_id": "r1", "artifacts": {}}}


def test_config_preserves_quoted_dollar_and_does_not_execute_shell(load, tmp_path):
    hook = load("config")
    ctx = context(tmp_path)
    source = tmp_path / "gitlab-file"
    source.write_text("PASSWORD='a$b'\nIGNORED=$(touch /tmp/never-run-release-test)\n")
    ctx["config_file"] = str(source)
    result = hook.execute("materialize", ctx)
    assert Path(result["env_file"]).read_bytes() == source.read_bytes()
    assert Path(result["env_file"]).stat().st_mode & 0o777 == 0o600


def test_registry_password_uses_stdin_and_returns_remote_digest(load, tmp_path, monkeypatch):
    hook = load("registry")
    ctx = context(tmp_path)
    ctx["results"]["build.build"] = {"images": {"backend": "acr.example/ns/backend:r1"}}
    monkeypatch.setenv("ACR_REGISTRY", "acr.example")
    monkeypatch.setenv("ACR_PUSH_USERNAME", "builder")
    monkeypatch.setenv("ACR_PUSH_PASSWORD", "secret-value")
    calls = []

    def run(command, **kwargs):
        calls.append((command, kwargs))
        if "inspect" in command:
            return "sha256:" + "a" * 64
        return ""

    monkeypatch.setattr(hook, "run", run)
    result = hook.execute("publish", ctx)
    assert result["artifacts"]["backend"] == "acr.example/ns/backend@sha256:" + "a" * 64
    login = next(call for call in calls if "login" in call[0])
    assert login[1]["input"] == "secret-value\n"
    assert not any("secret-value" in arg for command, _ in calls for arg in command)
    assert any("push" in command for command, _ in calls)


def test_storage_verification_downloads_and_compares_bytes(load, tmp_path, monkeypatch):
    import hashlib
    hook = load("storage")
    ctx = context(tmp_path)
    source = Path(ctx["work_dir"]) / "database.dump"
    source.write_bytes(b"database")
    ctx["results"]["database.backup"] = {"backup_id": "r1", "files": [
        {"path": str(source), "sha256": hashlib.sha256(b"database").hexdigest()}]}
    ctx["results"]["storage.put"] = {"backup_id": "r1", "reference": "oss://test/predeploy/r1/"}
    calls = []

    def run(command, **kwargs):
        calls.append(command)
        if "cp" in command:
            Path(command[-2]).write_bytes(b"corrupt")
        return ""

    monkeypatch.setattr(hook, "run", run)
    monkeypatch.setenv("OSS_ENDPOINT", "https://oss-example-internal.aliyuncs.com")
    monkeypatch.setenv("OSS_REGION", "cn-example")
    with pytest.raises(Exception, match="checksum"):
        hook.execute("verify", ctx)
    assert any("cp" in command for command in calls)
    assert not any("_COMPLETE" in " ".join(command) for command in calls)


def test_transport_rejects_remote_command_injection_before_ssh(load, tmp_path, monkeypatch):
    hook = load("transport")
    ctx = context(tmp_path)
    monkeypatch.setenv("DEPLOY_HOST", "host; touch /tmp/no")
    monkeypatch.setenv("DEPLOY_USER", "deploy")
    monkeypatch.setenv("DEPLOY_ROOT", "/srv/rapidkit")
    monkeypatch.setenv("SSH_PRIVATE_KEY", "/tmp/key")
    monkeypatch.setenv("SSH_KNOWN_HOSTS", "/tmp/known")
    with pytest.raises(Exception):
        hook.execute("dispatch", ctx)


def test_drain_disables_restarts_and_never_sends_kill(load, tmp_path, monkeypatch):
    hook = load("runtime")
    ctx = context(tmp_path)
    calls = []
    states = {"beat": True, "api": True, "worker": True}

    def containers(c, services=None):
        names = {"celery-beat": "beat", "backend-api": "api", "celery-worker": "worker"}
        return [names[s] for s in (services or names) if s in names]

    def run(command, **kwargs):
        calls.append(command)
        if "kill" in command:
            states[command[-1]] = False
        if "inspect" in command:
            return json.dumps([{"State": {"Running": states[command[-1]], "Restarting": False}}])
        return ""

    monkeypatch.setattr(hook, "container_ids", containers)
    monkeypatch.setattr(hook, "run", run)
    result = hook.execute("drain", ctx)
    assert result["stopped"] is True
    updates = [c for c in calls if "update" in c]
    signals = [c for c in calls if "kill" in c]
    assert len(updates) == 3
    assert all("--restart=no" in c for c in updates)
    assert all("--signal=TERM" in c for c in signals)
    assert not any("KILL" in c or "stop" in c for c in calls)


def test_failed_migration_is_not_declared_compatible_only_because_revision_matches(load, tmp_path, monkeypatch):
    hook = load("database")
    ctx = context(tmp_path)
    ctx["results"]["database.backup"] = {"revisions": ["old"]}
    monkeypatch.setattr(hook, "revisions", lambda c: ["old"])
    assert hook.execute("check-compatibility", ctx)["compatible"] is False
    ctx["results"]["database.migrate"] = {"revisions": ["old"], "target_revisions": ["old"]}
    assert hook.execute("check-compatibility", ctx)["compatible"] is True


def test_backup_retention_never_removes_an_unconfirmed_backup(load, tmp_path, monkeypatch):
    hook = load("storage")
    ctx = context(tmp_path)
    root = Path(ctx["root"])
    for name, complete, stamp in (("old", True, 100), ("recent", True, 200), ("failed", False, 300)):
        directory = root / "releases" / name
        (directory / "work/backups").mkdir(parents=True)
        (directory / "work/backups/database.dump").write_bytes(name.encode())
        (directory / "state.json").write_text(json.dumps({"results": {"storage.commit": {"complete": complete}}}))
        import os
        os.utime(directory, (stamp, stamp))
    source = Path(ctx["work_dir"]) / "backups"
    source.mkdir()
    (source / "database.dump").write_bytes(b"current")
    (Path(ctx["work_dir"]) / "backup.json").write_text("{}")
    ctx["results"]["storage.put"] = {"backup_id": "r1", "reference": "oss://test-bucket/predeploy/r1/"}
    ctx["results"]["storage.verify"] = {**ctx["results"]["storage.put"], "verified": True}
    monkeypatch.setattr(hook, "run", lambda *a, **k: "")
    monkeypatch.setenv("OSS_ENDPOINT", "https://oss-test-internal.aliyuncs.com")
    monkeypatch.setenv("OSS_REGION", "cn-test")
    assert hook.execute("commit", ctx)["complete"] is True
    assert not (root / "releases/old/work/backups").exists()
    assert (root / "releases/recent/work/backups/database.dump").exists()
    assert (root / "releases/failed/work/backups/database.dump").exists()
    assert (source / "database.dump").exists()


def test_beat_probe_checks_the_scheduler_redis_database(load, monkeypatch, capsys):
    from types import SimpleNamespace
    from redis import Redis
    hook = load("application")
    monkeypatch.setitem(sys.modules, "rapidkit_core.config", SimpleNamespace(settings=SimpleNamespace(
        REDIS_URL="redis://configured/0", CELERY_REDIS_URL="redis://configured/1")))

    class Client:
        def __init__(self, url): self.url = url
        def __enter__(self): return self
        def __exit__(self, *args): pass
        def get(self, key): return self.url == "redis://configured/0" and key == "leader:celery-beat"

    monkeypatch.setattr(Redis, "from_url", Client)
    monkeypatch.setattr(sys, "argv", ["application.py", "beat"])
    hook.main()
    assert json.loads(capsys.readouterr().out.removeprefix("RELEASE_JSON="))["ready"] is True


@pytest.mark.parametrize("arguments,expected", [
    (["--hostname", "celery@%h"], "celery@worker.example"),
    (["--hostname=celery@%h"], "celery@worker.example"),
    (["-n", "celery@%n"], "celery@worker"),
    (["--hostname", "celery@prod-default-unique"], "celery@prod-default-unique"),
])
def test_worker_probe_targets_the_resolved_control_address(load, monkeypatch, capsys, arguments, expected):
    from types import SimpleNamespace
    from celery.utils import nodenames

    hook = load("application")
    settings = SimpleNamespace(CELERY_WORKER_GROUP="prod/default", CELERY_WORKER_DEPLOYMENT="r1")

    def ping(*, destination, timeout):
        return [{expected: {"ok": "pong"}}] if destination == [expected] else []

    monkeypatch.setitem(sys.modules, "rapidkit_core.config", SimpleNamespace(settings=settings))
    monkeypatch.setitem(sys.modules, "src.queues.app", SimpleNamespace(app=SimpleNamespace(
        control=SimpleNamespace(ping=ping))))
    monkeypatch.setattr(nodenames, "gethostname", lambda: "worker.example")
    monkeypatch.setattr(Path, "read_bytes", lambda self: "\0".join(["celery", *arguments, ""]).encode())
    monkeypatch.setattr(sys, "argv", ["application.py", "worker"])

    hook.main()

    assert json.loads(capsys.readouterr().out.removeprefix("RELEASE_JSON=")) == {
        "ready": True, "group": "prod/default", "deployment": "r1"}


@pytest.mark.parametrize("failure", ["prepare", "start", "verify", "finish"])
def test_recovery_retries_interrupted_worker_deployments(load, tmp_path, monkeypatch, failure):
    hook = load("runtime")
    ctx = {**context(tmp_path), "kind": "release"}
    capacities = {"prod/default": {"replicas": 1}, "prod/reports": {"replicas": 2}}
    pending = {}
    state = {"failed": False, "running": False}

    def interrupt(phase):
        if phase == failure and not state["failed"]:
            state["failed"] = True
            raise hook.HookError("Interrupted " + phase)

    def inventory(c, action, group, replicas):
        assert not state["running"] or action == "finish"
        if action in ("prepare", "finish") and group == "prod/reports":
            interrupt(action)
        if action == "prepare":
            if group in pending:
                raise hook.HookError("A deployment is already in progress")
            pending[group] = hook.worker_token(c)
        else:
            assert pending[group] == hook.worker_token(c)
            del pending[group]

    def start(c, include_beat=False):
        interrupt("start")
        state["running"] = True

    def verify(c):
        interrupt("verify")
        return {"ready": state["running"]}

    def wait_stopped(c, services):
        state["running"] = False

    monkeypatch.setattr(hook, "container_ids", lambda *args: ["old-api"] if state["running"] else [])
    monkeypatch.setattr(hook, "running", lambda identifier: state["running"])
    monkeypatch.setattr(hook, "wait_stopped", wait_stopped)
    monkeypatch.setattr(hook, "groups", lambda c: capacities)
    monkeypatch.setattr(hook, "application", lambda c, action: {"pending": dict(pending)})
    monkeypatch.setattr(hook, "inventory", inventory)
    monkeypatch.setattr(hook, "start", start)
    monkeypatch.setattr(hook, "verify", verify)

    with pytest.raises(hook.HookError, match="Interrupted " + failure):
        hook.execute("recover", ctx)
    assert pending
    assert hook.execute("recover", ctx) == {"restored": True}
    assert pending == {}
    assert state["running"] is True


def test_recovery_preserves_another_releases_pending_intent(load, tmp_path, monkeypatch):
    hook = load("runtime")
    ctx = {**context(tmp_path), "kind": "release"}
    pending = {"prod/default": "other-release"}

    def inventory(c, action, group, replicas):
        if action == "prepare" and group in pending:
            raise hook.HookError("A deployment is already in progress")
        pytest.fail("Recovery must not modify another release's deployment")

    monkeypatch.setattr(hook, "container_ids", lambda *args: [])
    monkeypatch.setattr(hook, "groups", lambda c: {"prod/default": {"replicas": 1}})
    monkeypatch.setattr(hook, "application", lambda c, action: {"pending": dict(pending)})
    monkeypatch.setattr(hook, "inventory", inventory)

    with pytest.raises(hook.HookError, match="already in progress"):
        hook.execute("recover", ctx)
    assert pending == {"prod/default": "other-release"}


def test_compose_uses_one_literal_env_and_supports_an_additional_worker_group(load, tmp_path, monkeypatch):
    import shutil
    if not shutil.which("docker"):
        pytest.skip("Compose CLI not installed")
    hook = load("runtime")
    ctx = context(tmp_path)
    root = Path(__file__).resolve().parents[2]
    production = Path(ctx["bundle"]) / "docker/prod"
    production.mkdir(parents=True)
    for name in ("docker-compose.yml", "nginx.conf"):
        shutil.copyfile(root / "docker/prod" / name, production / name)
    extra = Path(ctx["bundle"]) / "deploy/custom/worker-groups.yml"
    extra.parent.mkdir(parents=True)
    extra.write_text('''services:
  celery-reports:
    extends:
      file: ../../docker/prod/docker-compose.yml
      service: celery-worker
    environment:
      CELERY_WORKER_GROUP: prod/reports
    deploy:
      replicas: 2
''')
    env = tmp_path / "runtime.env"
    env.write_text("POSTGRESQL_PASSWORD='a$b'\nCELERY_WORKER_GROUP=prod/default\nCELERY_WORKER_REPLICAS=3\n")
    ctx["env_file"] = str(env)
    ctx["options"] = {"worker_services": ["celery-worker", "celery-reports"], "compose_files": [str(extra)]}
    ctx["manifest"]["artifacts"] = {"backend": "test-backend@sha256:" + "a" * 64,
                                      "frontend": "test-frontend@sha256:" + "b" * 64}
    monkeypatch.setenv("CELERY_WORKER_REPLICAS", "999")
    capacities = hook.groups(ctx)
    assert capacities["prod/default"]["replicas"] == 3
    assert capacities["prod/reports"]["replicas"] == 2
    config = hook.resolved(ctx)
    assert config["services"]["backend-api"]["environment"]["POSTGRESQL_PASSWORD"] == "a$b"


def test_example_build_and_publish_keep_the_runner_docker_connection(tmp_path, monkeypatch):
    import os
    import subprocess
    binary = tmp_path / "bin"
    binary.mkdir()
    docker = binary / "docker"
    docker.write_text('''#!/usr/bin/env python3
import os,sys
if os.environ.get('DOCKER_HOST')!='tcp://isolated-docker:2376': raise SystemExit(9)
if 'login' in sys.argv:
 assert sys.stdin.read()=='build-secret\\n'
if 'imagetools' in sys.argv: print('sha256:'+'c'*64)
''')
    docker.chmod(0o755)
    monkeypatch.setenv("PATH", str(binary) + ":" + os.environ["PATH"])
    for key, value in {"DOCKER_HOST": "tcp://isolated-docker:2376", "ACR_REGISTRY": "acr.example",
                       "ACR_BACKEND_REPOSITORY": "acr.example/ns/backend", "ACR_FRONTEND_REPOSITORY": "acr.example/ns/frontend",
                       "ACR_PUSH_USERNAME": "builder", "ACR_PUSH_PASSWORD": "build-secret"}.items():
        monkeypatch.setenv(key, value)
    root = Path(__file__).resolve().parents[2]
    output = tmp_path / "built"
    result = subprocess.run([sys.executable, str(root / "deploy/release.py"), "build", "--profile",
                             str(EXAMPLES / "profile.json"), "--source-root", str(root), "--work-dir", str(output),
                             "--release-id", "r1", "--commit", "a" * 40, "--tag", "v1.0.0"],
                            capture_output=True, text=True)
    assert result.returncode == 0, result.stderr
    manifest = json.loads((output / "manifest.json").read_text())
    assert manifest["artifacts"]["backend"] == "acr.example/ns/backend@sha256:" + "c" * 64
    assert (output / "docker/prod/docker-compose.yml").exists()
    assert not (output / "runtime.env").exists()


def test_preflight_rejects_switching_database_defaults_or_network(load, tmp_path):
    hook = load("runtime")
    ctx = context(tmp_path)
    config = {"networks": {"default": {"name": "production-network"}},
              "services": {"backend-api": {"networks": {"default": {}}, "environment": {"REDIS_DATABASE": "1"}}}}
    info = {"Config": {"Env": []}, "NetworkSettings": {"Networks": {"production-network": {}}}}
    with pytest.raises(Exception, match="REDIS_DATABASE"):
        hook.validate_current(ctx, config, info)
    config["services"]["backend-api"]["environment"]["REDIS_DATABASE"] = "0"
    hook.validate_current(ctx, config, info)
    config["networks"]["default"]["name"] = "another-project-network"
    with pytest.raises(Exception, match="network"):
        hook.validate_current(ctx, config, info)


def test_probe_errors_report_field_names_without_validation_inputs(load):
    hook = load("support")
    script = "import json; print('RELEASE_ERROR='+json.dumps({'type':'ValidationError','fields':['NEW_SETTING'],'input':'never-print'})); raise SystemExit(1)"
    with pytest.raises(Exception) as failure:
        hook.run([sys.executable, "-c", script], probe=True)
    assert "NEW_SETTING" in str(failure.value)
    assert "never-print" not in str(failure.value)


def test_worker_deployment_identity_fits_backend_limit_for_long_release_ids(load, tmp_path):
    hook = load("support")
    ctx = context(tmp_path)
    ctx["env_file"] = str(tmp_path / "runtime.env")
    ctx["release_id"] = "a" * 90
    first = hook.environment(ctx)["CELERY_WORKER_DEPLOYMENT"]
    assert 1 <= len(first) <= 64
    assert hook.environment(ctx)["CELERY_WORKER_DEPLOYMENT"] == first
    ctx["release_id"] = "b" * 90
    assert hook.environment(ctx)["CELERY_WORKER_DEPLOYMENT"] != first
