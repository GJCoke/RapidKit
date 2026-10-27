"""Release safety tests using executable hooks independent of the shipped examples."""

import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

CLI = Path(__file__).parents[1] / "release.py"

HOOK = r'''
import argparse, hashlib, json, os, time
from pathlib import Path
p=argparse.ArgumentParser(); p.add_argument('action'); p.add_argument('--context'); p.add_argument('--result'); a=p.parse_args()
c=json.loads(Path(a.context).read_text()); o=c['options']; cap=c['capability']; action=a.action
assert 'UNRELATED_SECRET' not in os.environ
with open(o['log'],'a') as f: f.write(cap+'.'+action+'\n')
if o.get('fail') == cap+'.'+action: raise SystemExit(2)
if o.get('sleep_at') == cap+'.'+action: time.sleep(5)
if cap=='runtime' and o.get('maintenance_marker'):
 marker=Path(o['maintenance_marker'])
 if action=='maintenance-on': marker.touch()
 elif action=='stop-candidate': assert marker.exists(), 'Services must stop behind maintenance'
 elif action=='maintenance-off': marker.unlink(missing_ok=True)
d={}
if cap=='registry': d={'pulled':True}
if cap=='runtime':
 if action=='inspect':
  d={'containers':['old']}
  if o.get('require_existing'): d['artifacts']={'backend':'existing@sha256:'+'b'*64}
 elif action=='preflight':
  if o.get('require_existing'): assert c['manifest']['artifacts']['backend']=='existing@sha256:'+'b'*64
  d={'ready':True}
 elif action=='adopt': d={'adopted':True}
 elif action=='drain' or action=='stop-candidate': d={'stopped':True}
 elif action=='start': d={'started':True}
 elif action=='verify': d={'ready':True}
 elif action=='commit': d={'committed':True}
 elif action=='recover': d={'restored':True}
 elif action.startswith('maintenance-'): d={'maintenance':action=='maintenance-on'}
 if action=='maintenance-on' and o.get('maintenance_failure_file') and Path(o['maintenance_failure_file']).exists():
  d['maintenance']=False
if cap=='database':
 if action=='inspect': d={'revisions':['old'],'migration_running':bool(o.get('busy_file') and Path(o['busy_file']).exists())}
 elif action=='backup':
  b=Path(c['work_dir'])/'backup.dump'; b.write_bytes(b'important data')
  d={'backup_id':c['release_id'],'files':[{'path':str(b),'sha256':hashlib.sha256(b.read_bytes()).hexdigest()}],'revisions':['old']}
 elif action=='migrate': d={'revisions':['new'],'target_revisions':['new']}
 elif action=='check-compatibility': d={'compatible':o.get('compatible',False)}
if cap=='storage':
 d={'backup_id':c['release_id'],'reference':'test://'+c['release_id']}
 if action=='preflight': d['ready']=True
 if action=='verify': d['verified']=not o.get('bad_backup',False)
 if action=='commit': d['complete']=True
if o.get('wrong_id'): c['release_id']='other'
Path(a.result).write_text(json.dumps({'version':1,'release_id':c['release_id'],'capability':cap,'action':action,'data':d}))
'''


@pytest.fixture
def environment(tmp_path, monkeypatch):
    monkeypatch.setenv("UNRELATED_SECRET", "must-never-reach-hook")
    script = tmp_path / "hook.py"
    script.write_text(HOOK)
    log = tmp_path / "calls"
    root = tmp_path / "target"

    def bundle(name, **options):
        directory = tmp_path / name
        directory.mkdir()
        profile = {"version": 1, "hooks": {}}
        for capability in ["registry", "runtime", "database", "storage"]:
            profile["hooks"][capability] = {
                "command": [sys.executable, str(script)],
                "options": {"log": str(log), **options},
                "timeout": 5,
                "actions": {
                    "registry": ["publish", "pull"],
                    "runtime": ["inspect", "preflight", "adopt", "maintenance-on", "drain", "start", "verify", "commit", "stop-candidate", "recover", "maintenance-off"],
                    "database": ["inspect", "backup", "migrate", "check-compatibility"],
                    "storage": ["preflight", "put", "verify", "commit", "get"],
                }[capability],
            }
        (directory / "profile.json").write_text(json.dumps(profile))
        (directory / "manifest.json").write_text(json.dumps({
            "version": 1, "release_id": name, "commit": "a" * 40,
            "tag": "v1.0.0", "artifacts": {"backend": "test@sha256:" + "a" * 64},
        }))
        (directory / "runtime.env").write_text("SECRET='a$b'\n")
        return directory

    def run(command, directory, **kwargs):
        return subprocess.run(
            [sys.executable, str(CLI), command, "--root", str(root), "--bundle", str(directory)],
            capture_output=True, text=True, **kwargs,
        )

    old = bundle("old")
    return bundle, run, old, root, log


def adopt(environment):
    _, run, old, _, log = environment
    result = run("adopt", old)
    assert result.returncode == 0, result.stderr
    log.write_text("")


def test_success_requires_verified_backup_before_migration(environment):
    bundle, run, _, root, log = environment
    adopt(environment)
    result = run("release", bundle("next"))
    assert result.returncode == 0, result.stderr
    calls = log.read_text().splitlines()
    assert calls.index("runtime.drain") < calls.index("database.backup")
    assert calls.index("storage.verify") < calls.index("storage.commit") < calls.index("database.migrate")
    assert calls.index("runtime.verify") < calls.index("runtime.commit") < calls.index("runtime.maintenance-off")
    assert json.loads((root / "current.json").read_text())["release_id"] == "next"


@pytest.mark.parametrize("options", [{"bad_backup": True}, {"fail": "storage.put"}, {"fail": "storage.commit"}])
def test_backup_failure_never_migrates_and_restores_old_version(environment, options):
    bundle, run, _, root, log = environment
    adopt(environment)
    result = run("release", bundle("next", **options))
    assert result.returncode != 0
    calls = log.read_text().splitlines()
    assert "database.migrate" not in calls
    assert "runtime.recover" in calls
    assert json.loads((root / "current.json").read_text())["release_id"] == "old"


def test_migration_failure_keeps_maintenance_and_blocks_next_release(environment):
    bundle, run, _, root, log = environment
    adopt(environment)
    candidate = bundle("next", fail="database.migrate")
    result = run("release", candidate)
    assert result.returncode != 0
    assert "runtime.maintenance-off" not in log.read_text()
    assert "runtime.recover" not in log.read_text()
    state = json.loads((root / "releases/next/state.json").read_text())
    assert state["migration_started"] is True
    second = run("release", bundle("later"))
    assert second.returncode != 0
    assert "unfinished" in second.stderr.lower()


def test_new_install_cannot_silently_replace_existing_production(environment):
    bundle, run, _, _, log = environment
    result = run("release", bundle("next"))
    assert result.returncode != 0
    assert "adopt" in result.stderr.lower()
    assert not log.exists()


def test_missing_hook_and_invalid_contract_fail_before_maintenance(environment):
    bundle, run, _, _, log = environment
    adopt(environment)
    candidate = bundle("next")
    profile = json.loads((candidate / "profile.json").read_text())
    del profile["hooks"]["storage"]
    (candidate / "profile.json").write_text(json.dumps(profile))
    result = run("release", candidate)
    assert result.returncode != 0
    assert "runtime.maintenance-on" not in log.read_text()


def test_hook_result_cannot_belong_to_another_release(environment):
    bundle, run, _, _, log = environment
    adopt(environment)
    result = run("release", bundle("next", wrong_id=True))
    assert result.returncode != 0
    assert "runtime.maintenance-on" not in log.read_text()


def test_schema_unknown_explicit_recovery_does_not_restart_old_app(environment):
    bundle, run, _, _, log = environment
    adopt(environment)
    candidate = bundle("next", fail="database.migrate")
    assert run("release", candidate).returncode != 0
    log.write_text("")
    result = run("recover", candidate)
    assert result.returncode != 0
    assert "runtime.recover" not in log.read_text()


def test_compatible_recovery_uses_snapshotted_old_hook(environment):
    bundle, run, _, root, log = environment
    adopt(environment)
    candidate = bundle("next", fail="runtime.verify", compatible=True)
    assert run("release", candidate).returncode != 0
    log.write_text("")
    result = run("recover", candidate)
    assert result.returncode == 0, result.stderr
    assert "runtime.recover" in log.read_text()
    assert json.loads((root / "current.json").read_text())["release_id"] == "old"


def test_recovery_reestablishes_maintenance_before_stopping_services(environment, tmp_path):
    bundle, run, _, root, log = environment
    adopt(environment)
    marker = tmp_path / "maintenance"
    candidate = bundle("next", fail="runtime.verify", compatible=True, maintenance_marker=str(marker))
    assert run("release", candidate).returncode != 0
    marker.unlink()
    log.write_text("")

    result = run("recover", candidate)

    assert result.returncode == 0, result.stderr
    calls = log.read_text().splitlines()
    assert calls.index("runtime.maintenance-on") < calls.index("runtime.stop-candidate") < calls.index("runtime.recover")
    assert json.loads((root / "current.json").read_text()) == {"release_id": "old"}
    assert not (root / "active.json").exists()


def test_recovery_does_not_change_services_until_maintenance_is_confirmed(environment, tmp_path):
    bundle, run, _, root, log = environment
    adopt(environment)
    reject = tmp_path / "reject-maintenance"
    candidate = bundle("next", fail="runtime.verify", compatible=True, maintenance_failure_file=str(reject))
    assert run("release", candidate).returncode != 0
    reject.touch()
    log.write_text("")

    result = run("recover", candidate)

    assert result.returncode != 0
    assert log.read_text().splitlines() == ["runtime.maintenance-on"]
    assert json.loads((root / "active.json").read_text()) == {"release_id": "next"}


def test_active_target_lock_blocks_release(environment):
    import fcntl
    bundle, run, _, root, log = environment
    adopt(environment)
    with (root / "release.lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        result = run("release", bundle("next"))
    assert result.returncode != 0
    assert not log.read_text()


def test_registry_pull_is_finished_before_maintenance(environment):
    bundle, run, _, _, log = environment
    adopt(environment)
    result = run("release", bundle("next"))
    assert result.returncode == 0, result.stderr
    calls = log.read_text().splitlines()
    assert calls.index("registry.pull") < calls.index("runtime.maintenance-on")


def test_readiness_failure_stops_candidate_services_without_opening_traffic(environment):
    bundle, run, _, _, log = environment
    adopt(environment)
    result = run("release", bundle("next", fail="runtime.verify"))
    assert result.returncode != 0
    calls = log.read_text().splitlines()
    assert "runtime.stop-candidate" in calls
    assert "runtime.maintenance-off" not in calls


def test_dispatch_reuses_images_but_creates_a_fresh_attempt_and_keeps_artifacts_secret_free(environment, tmp_path):
    bundle, _, _, _, _ = environment
    candidate = bundle("built")
    script = tmp_path / "dispatch-hook.py"
    script.write_text('''import argparse,json,shutil
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('action');p.add_argument('--context');p.add_argument('--result');a=p.parse_args()
c=json.loads(Path(a.context).read_text())
if a.action=='materialize':
 path=Path(c['bundle'])/'runtime.env';shutil.copyfile(c['config_file'],path);d={'env_file':str(path)}
else:
 assert Path(c['bundle'],'runtime.env').read_text()=='ONLY_DEPLOY_SECRET=secret'
 assert c['manifest']['build_id']=='built'
 assert c['manifest']['artifacts']['backend'].startswith('test@sha256:')
 d={'status':'success','release_id':c['release_id']}
Path(a.result).write_text(json.dumps({'version':1,'release_id':c['release_id'],'capability':c['capability'],'action':a.action,'data':d}))
''')
    profile = json.loads((candidate / "profile.json").read_text())
    for name in ("config", "transport"):
        profile["hooks"][name] = {"command": [sys.executable, str(script)], "actions": ["materialize"] if name == "config" else ["dispatch", "status"]}
    (candidate / "profile.json").write_text(json.dumps(profile))
    (candidate / "runtime.env").unlink()
    secret = tmp_path / "gitlab-config"
    secret.write_text("ONLY_DEPLOY_SECRET=secret")
    attempts = []
    for _ in range(2):
        result = subprocess.run([sys.executable, str(CLI), "dispatch", "--bundle", str(candidate),
                                 "--config-file", str(secret)], capture_output=True, text=True)
        assert result.returncode == 0, result.stderr
        attempts.append(json.loads(result.stdout)["release_id"])
    assert attempts[0] != attempts[1]
    assert json.loads((candidate / "manifest.json").read_text())["release_id"] == "built"
    assert not (candidate / "runtime.env").exists()
    assert "secret" not in result.stdout


def test_adoption_captures_existing_images_before_preflighting_the_baseline(environment):
    bundle, run, _, root, _ = environment
    candidate = bundle("baseline", require_existing=True)
    result = run("adopt", candidate)
    assert result.returncode == 0, result.stderr
    captured = json.loads((root / "releases/baseline/bundle/manifest.json").read_text())
    assert captured["artifacts"]["backend"] == "existing@sha256:" + "b" * 64


def test_profile_rejects_missing_actions_before_any_hook_runs(environment):
    bundle, run, _, _, log = environment
    candidate = bundle("baseline")
    profile = json.loads((candidate / "profile.json").read_text())
    profile["hooks"]["database"]["actions"] = ["inspect"]
    (candidate / "profile.json").write_text(json.dumps(profile))
    result = run("adopt", candidate)
    assert result.returncode != 0
    assert not log.exists()


def test_core_build_works_without_any_docker_or_vendor_files(tmp_path):
    source = tmp_path / "source"
    (source / "deploy").mkdir(parents=True)
    script = source / "deploy/custom.py"
    script.write_text('''import argparse,json
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('action');p.add_argument('--context');p.add_argument('--result');a=p.parse_args()
c=json.loads(Path(a.context).read_text());d={'built':True} if a.action=='build' else {'artifacts':{'application':'immutable:test'}}
Path(a.result).write_text(json.dumps({'version':1,'release_id':c['release_id'],'capability':c['capability'],'action':a.action,'data':d}))
''')
    profile = tmp_path / "profile.json"
    profile.write_text(json.dumps({"version": 1, "hooks": {
        name: {"command": [sys.executable, "{bundle}/deploy/custom.py"], "actions": actions}
        for name, actions in (("build", ["build"]), ("registry", ["publish", "pull"]))
    }}))
    output = tmp_path / "output"
    result = subprocess.run([sys.executable, str(CLI), "build", "--profile", str(profile), "--source-root", str(source),
                             "--work-dir", str(output), "--release-id", "r1", "--commit", "a" * 40, "--tag", "v1.0.0"],
                            capture_output=True, text=True)
    assert result.returncode == 0, result.stderr
    assert json.loads((output / "manifest.json").read_text())["artifacts"] == {"application": "immutable:test"}
    assert not (output / "docker").exists()


def test_dispatch_error_reports_attempt_and_missing_setting_without_config_secrets(environment, tmp_path):
    bundle, _, _, _, _ = environment
    candidate = bundle("built")
    examples = CLI.parent / "examples/aliyun"
    profile = json.loads((candidate / "profile.json").read_text())
    for name, actions in (("config", ["materialize"]), ("transport", ["dispatch", "status"])):
        profile["hooks"][name] = {"command": [sys.executable, str(examples / f"{name}.py")], "actions": actions}
    (candidate / "profile.json").write_text(json.dumps(profile))
    secret = tmp_path / "production-env"
    secret.write_text("PASSWORD=never-print-this-value")
    result = subprocess.run([sys.executable, str(CLI), "dispatch", "--bundle", str(candidate),
                             "--config-file", str(secret)], capture_output=True, text=True)
    assert result.returncode != 0
    assert "DEPLOY_HOST" in result.stderr
    assert "Release attempt: built-" in result.stderr
    assert "never-print-this-value" not in result.stderr + result.stdout


def test_storage_timeout_recovers_without_migrating(environment):
    bundle, run, _, _, log = environment
    adopt(environment)
    candidate = bundle("next", sleep_at="storage.put")
    profile = json.loads((candidate / "profile.json").read_text())
    profile["hooks"]["storage"]["timeout"] = 0.3
    (candidate / "profile.json").write_text(json.dumps(profile))
    result = run("release", candidate)
    assert result.returncode != 0
    assert "database.migrate" not in log.read_text()
    assert "runtime.recover" in log.read_text()


def test_killed_release_leaves_migration_journal_and_blocks_a_new_attempt(environment):
    import contextlib
    import signal
    import time
    bundle, run, _, root, _ = environment
    adopt(environment)
    candidate = bundle("next", sleep_at="database.migrate")
    process = subprocess.Popen([sys.executable, str(CLI), "release", "--root", str(root), "--bundle", str(candidate)],
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    children = []
    try:
        deadline = time.monotonic() + 10
        state_path = root / "releases/next/state.json"
        while time.monotonic() < deadline:
            if state_path.exists() and json.loads(state_path.read_text())["phase"] == "database.migrate":
                children = Path(f"/proc/{process.pid}/task/{process.pid}/children").read_text().split()
                if children:
                    break
            time.sleep(0.02)
        assert children, "release did not reach migration"
        process.kill()
        process.wait(timeout=2)
        state = json.loads(state_path.read_text())
        assert state["migration_started"] is True
        assert state["status"] == "running"
        result = run("release", bundle("later"))
        assert result.returncode != 0
        assert "lock" in result.stderr.lower() or "unfinished" in result.stderr.lower()
    finally:
        if process.poll() is None:
            process.kill()
            process.wait()
        for child in children:
            with contextlib.suppress(ProcessLookupError):
                os.killpg(int(child), signal.SIGTERM)


def test_explicit_repair_can_supersede_failed_migration_with_another_verified_backup(environment):
    bundle, run, _, root, log = environment
    adopt(environment)
    failed = bundle("failed", fail="database.migrate")
    assert run("release", failed).returncode != 0
    repaired = bundle("repair")
    result = subprocess.run([sys.executable, str(CLI), "release", "--root", str(root), "--bundle", str(repaired),
                             "--repair-from", "failed"], capture_output=True, text=True)
    assert result.returncode == 0, result.stderr
    assert json.loads((root / "current.json").read_text())["release_id"] == "repair"
    previous = json.loads((root / "releases/failed/state.json").read_text())
    assert previous["status"] == "superseded" and previous["repaired_by"] == "repair"
    state = json.loads((root / "releases/repair/state.json").read_text())
    assert state["previous"]["release_id"] == "old"
    assert state["repair_from"] == "failed"
    assert log.read_text().count("database.backup") == 2


def test_repair_rejects_a_still_running_migration_before_handoff(environment, tmp_path):
    bundle, run, _, root, _ = environment
    adopt(environment)
    marker = tmp_path / "migration-running"
    failed = bundle("failed", fail="database.migrate", busy_file=str(marker))
    assert run("release", failed).returncode != 0
    marker.touch()
    result = subprocess.run([sys.executable, str(CLI), "release", "--root", str(root), "--bundle", str(bundle("repair")),
                             "--repair-from", "failed"], capture_output=True, text=True)
    assert result.returncode != 0
    assert json.loads((root / "active.json").read_text())["release_id"] == "failed"
    assert not (root / "releases/repair").exists()


def test_repair_backup_failure_keeps_maintenance_instead_of_restoring_old_schema(environment):
    bundle, run, _, root, log = environment
    adopt(environment)
    assert run("release", bundle("failed", fail="database.migrate")).returncode != 0
    log.write_text("")
    candidate = bundle("repair", bad_backup=True)
    result = subprocess.run([sys.executable, str(CLI), "release", "--root", str(root), "--bundle", str(candidate),
                             "--repair-from", "failed"], capture_output=True, text=True)
    assert result.returncode != 0
    assert "runtime.recover" not in log.read_text()
    assert "runtime.maintenance-off" not in log.read_text()
    assert json.loads((root / "active.json").read_text())["release_id"] == "repair"


def test_completed_journal_left_by_last_moment_crash_does_not_block_the_next_release(environment):
    bundle, run, _, root, _ = environment
    adopt(environment)
    assert run("release", bundle("next")).returncode == 0
    (root / "active.json").write_text(json.dumps({"release_id": "next"}))
    result = run("release", bundle("later"))
    assert result.returncode == 0, result.stderr
    assert json.loads((root / "releases/later/state.json").read_text())["previous"]["release_id"] == "next"


def test_recovery_refuses_a_modified_old_configuration_snapshot(environment):
    bundle, run, _, root, log = environment
    adopt(environment)
    candidate = bundle("next", fail="runtime.verify", compatible=True)
    assert run("release", candidate).returncode != 0
    (root / "releases/old/bundle/runtime.env").write_text("CHANGED=after-adoption\n")
    log.write_text("")
    result = run("recover", candidate)
    assert result.returncode != 0
    assert "runtime.recover" not in log.read_text()
    assert (root / "active.json").exists()


def test_build_bundle_cannot_be_copied_inside_its_own_code_tree(tmp_path, monkeypatch):
    import importlib.util
    spec = importlib.util.spec_from_file_location("release_guard", CLI)
    release = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(release)
    source = tmp_path / "source"
    (source / "deploy").mkdir(parents=True)
    profile = tmp_path / "profile.json"
    profile.write_text("{}")
    def forbidden(*args, **kwargs):
        pytest.fail("recursive copy must be rejected before copying")
    monkeypatch.setattr(release.shutil, "copytree", forbidden)
    with pytest.raises(release.ReleaseError):
        release.freeze(source, profile, source / "deploy/nested")
