#!/usr/bin/env python3
"""Provider-independent release orchestration. Python 3.10+, standard library only."""

import argparse
import contextlib
import fcntl
import hashlib
import json
import os
import re
import shutil
import signal
import subprocess
import sys
import tempfile
from pathlib import Path
from uuid import uuid4

VERSION = 1
ACTIONS = {
    "build": ("build",),
    "registry": ("publish", "pull"),
    "config": ("materialize",),
    "transport": ("dispatch", "status"),
    "runtime": (
        "inspect",
        "preflight",
        "adopt",
        "maintenance-on",
        "drain",
        "start",
        "verify",
        "commit",
        "stop-candidate",
        "recover",
        "maintenance-off",
    ),
    "database": ("inspect", "backup", "migrate", "check-compatibility"),
    "storage": ("preflight", "put", "verify", "commit", "get"),
}
TARGET_HOOKS = ("registry", "runtime", "database", "storage")
SAFE_ENV = ("PATH", "HOME", "LANG", "LC_ALL", "TMPDIR", "SSL_CERT_FILE", "SSL_CERT_DIR")


class ReleaseError(Exception):
    pass


def read(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def write(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    temporary = path.with_name(path.name + "." + uuid4().hex)
    with temporary.open("x", encoding="utf-8") as stream:
        os.chmod(temporary, 0o600)
        json.dump(value, stream, ensure_ascii=False, indent=2)
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(temporary, path)
    descriptor = os.open(path.parent, os.O_DIRECTORY)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def file_hash(path):
    digest = hashlib.sha256()
    with Path(path).open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def snapshot_hashes(directory):
    bundle = directory / "bundle"
    return {
        str(path.relative_to(bundle)): file_hash(path)
        for path in sorted(bundle.rglob("*"))
        if path.is_file()
        and "__pycache__" not in path.parts
        and path.name not in ("credentials.json", "target.log", "exit-code")
    }


def seal_snapshot(directory):
    write(directory / "integrity.json", snapshot_hashes(directory))


def verify_snapshot(directory):
    if snapshot_hashes(directory) != read(directory / "integrity.json"):
        raise ReleaseError("Release code/configuration snapshot changed; inspect before recovery")


def identity(value):
    if not isinstance(value, str) or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.-]{0,95}", value):
        raise ReleaseError("Invalid release ID")
    return value


def expand(value, bundle):
    if isinstance(value, str):
        return value.replace("{bundle}", str(bundle))
    if isinstance(value, list):
        return [expand(item, bundle) for item in value]
    if isinstance(value, dict):
        return {key: expand(item, bundle) for key, item in value.items()}
    return value


def load_profile(path, capabilities):
    profile = read(path)
    if not isinstance(profile, dict) or profile.get("version") != VERSION or not isinstance(profile.get("hooks"), dict):
        raise ReleaseError("Unsupported hook profile")
    for capability in capabilities:
        hook = profile["hooks"].get(capability, {})
        if not isinstance(hook, dict):
            raise ReleaseError(f"Invalid hook: {capability}")
        actions = hook.get("actions")
        if (
            not isinstance(actions, list)
            or not all(isinstance(action, str) for action in actions)
            or not set(ACTIONS[capability]).issubset(actions)
        ):
            raise ReleaseError(f"Missing hook actions: {capability}")
        if not isinstance(hook.get("options", {}), dict):
            raise ReleaseError(f"Invalid hook options: {capability}")
        per_action = hook.get("env_by_action", {})
        if not isinstance(per_action, dict) or any(
            action not in ACTIONS[capability]
            or not isinstance(names, list)
            or not all(isinstance(name, str) and re.fullmatch(r"[A-Z][A-Z0-9_]*", name) for name in names)
            for action, names in per_action.items()
        ):
            raise ReleaseError(f"Invalid action environment: {capability}")
        command = hook.get("command")
        if not isinstance(command, list) or not command or not all(isinstance(arg, str) and arg for arg in command):
            raise ReleaseError(f"Missing hook command: {capability}")
        if not isinstance(hook.get("env", []), list) or not all(
            isinstance(name, str) and re.fullmatch(r"[A-Z][A-Z0-9_]*", name) for name in hook.get("env", [])
        ):
            raise ReleaseError(f"Invalid environment allowlist: {capability}")
        timeout = hook.get("timeout", 600)
        if type(timeout) not in (int, float) or not 0 < timeout <= 86400:
            raise ReleaseError(f"Invalid hook timeout: {capability}")
    return profile


def invoke(profile, capability, action, context):
    if context.get("snapshot_dir"):
        verify_snapshot(Path(context["snapshot_dir"]))
    hook = profile["hooks"][capability]
    bundle = Path(context["bundle"])
    directory = Path(context["work_dir"]) / "hooks" / f"{capability}-{action}-{uuid4().hex}"
    directory.mkdir(parents=True, mode=0o700)
    payload = {
        **context,
        "version": VERSION,
        "capability": capability,
        "options": expand(hook.get("options", {}), bundle),
    }
    payload.pop("credentials", None)
    payload.pop("lock_fd", None)
    write(directory / "context.json", payload)
    command = [
        *expand(hook["command"], bundle),
        action,
        "--context",
        str(directory / "context.json"),
        "--result",
        str(directory / "result.json"),
    ]
    environment = {key: os.environ[key] for key in SAFE_ENV if key in os.environ}
    environment["PYTHONDONTWRITEBYTECODE"] = "1"
    credentials = context.get("credentials", {})
    for name in [*hook.get("env", []), *hook.get("env_by_action", {}).get(action, [])]:
        if name in credentials:
            environment[name] = credentials[name]
        elif name in os.environ:
            environment[name] = os.environ[name]
    with (directory / "output.log").open("wb") as output:
        process = subprocess.Popen(
            command,
            env=environment,
            stdout=output,
            stderr=subprocess.STDOUT,
            start_new_session=True,
            pass_fds=(context["lock_fd"],) if "lock_fd" in context else (),
        )
        try:
            code = process.wait(timeout=hook.get("timeout", 600))
        except BaseException:
            os.killpg(process.pid, signal.SIGTERM)
            try:
                process.wait(timeout=3)
            except subprocess.TimeoutExpired:
                os.killpg(process.pid, signal.SIGKILL)
                process.wait()
            raise ReleaseError(f"Hook interrupted/timed out: {capability}.{action}; inspect {directory}") from None
    if code:
        try:
            failure = read(directory / "result.json")
        except (OSError, ValueError):
            failure = {}
        expected = {"version": VERSION, "release_id": context["release_id"], "capability": capability, "action": action}
        message = failure.get("error") if isinstance(failure, dict) else None
        if isinstance(message, str) and len(message) <= 512 and all(failure.get(k) == v for k, v in expected.items()):
            for name, value in environment.items():
                if name not in SAFE_ENV and len(value) >= 8:
                    message = message.replace(value, "[redacted]")
            message = message.replace("\n", " ").replace("\r", " ")
            raise ReleaseError(f"Hook failed: {capability}.{action} (exit {code}): {message}")
        raise ReleaseError(f"Hook failed: {capability}.{action} (exit {code}); inspect {directory}")
    try:
        result = read(directory / "result.json")
    except (OSError, ValueError):
        raise ReleaseError(f"Missing/invalid result: {capability}.{action}") from None
    expected = {"version": VERSION, "release_id": context["release_id"], "capability": capability, "action": action}
    if (
        not isinstance(result, dict)
        or any(result.get(key) != value for key, value in expected.items())
        or not isinstance(result.get("data"), dict)
    ):
        raise ReleaseError(f"Hook result contract mismatch: {capability}.{action}")
    return result["data"]


def require(result, field, expected=True):
    if result.get(field) != expected or (type(expected) is bool and type(result.get(field)) is not bool):
        raise ReleaseError(f"Required hook evidence missing: {field}")


@contextlib.contextmanager
def target_lock(root):
    root.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.chmod(root, 0o700)
    with (root / "release.lock").open("a") as descriptor:
        try:
            fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise ReleaseError("Another operation holds the target lock") from None
        yield descriptor.fileno()


def bundle_manifest(bundle):
    manifest = read(bundle / "manifest.json")
    if manifest.get("version") != VERSION:
        raise ReleaseError("Unsupported manifest")
    identity(manifest.get("release_id"))
    return manifest


def context_for(root, directory, state, lock_fd=None):
    bundle = directory / "bundle"
    context = {
        "release_id": state["release_id"],
        "bundle": str(bundle),
        "snapshot_dir": str(directory),
        "root": str(root),
        "work_dir": str(directory / "work"),
        "manifest": bundle_manifest(bundle),
        "results": state.get("results", {}),
        "previous": state.get("previous"),
        "kind": state["kind"],
        "repair_from": state.get("repair_from"),
    }
    if (bundle / "runtime.env").is_file():
        context["env_file"] = str(bundle / "runtime.env")
    if (bundle / "credentials.json").exists():
        context["credentials"] = read(bundle / "credentials.json")
    if lock_fd is not None:
        context["lock_fd"] = lock_fd
    return context


def snapshot(root, bundle, manifest):
    directory = root / "releases" / manifest["release_id"]
    if directory.exists():
        raise ReleaseError("Release ID already exists; inspect status/recover, do not reuse it")
    directory.mkdir(parents=True, mode=0o700)
    shutil.copytree(bundle, directory / "bundle", symlinks=False)
    (directory / "work").mkdir(mode=0o700)
    seal_snapshot(directory)
    return directory


def unfinished(root):
    if not (root / "active.json").exists():
        return None
    active = read(root / "active.json")
    release_id = identity(active["release_id"])
    state = read(root / "releases" / release_id / "state.json")
    current = read(root / "current.json") if (root / "current.json").exists() else None
    expected = None
    if state["status"] == "success" and state["phase"] == "complete":
        expected = {"release_id": release_id}
    elif state["status"] == "recovered" and state["phase"] == "recovered":
        expected = state["previous"] or {"release_id": release_id}
    if expected and current == expected:
        (root / "active.json").unlink()
        return None
    return active


def operation(root, bundle, adopt=False, repair_from=None):
    manifest = bundle_manifest(bundle)
    profile = load_profile(bundle / "profile.json", TARGET_HOOKS)
    with target_lock(root) as lock_fd:
        active = unfinished(root)
        source_state = None
        if active:
            if not repair_from or identity(repair_from) != active["release_id"] or adopt:
                raise ReleaseError("An unfinished release needs status/recover or explicit --repair-from first")
            source_directory = root / "releases" / repair_from
            source_state = read(source_directory / "state.json")
            if (
                source_state["status"] not in ("failed", "recovery-failed", "running")
                or source_state["kind"] == "adopt"
            ):
                raise ReleaseError(
                    "Repair requires an adopted environment and a failed/interrupted release; "
                    "baseline adoption must recover first"
                )
            source_profile = load_profile(source_directory / "bundle/profile.json", TARGET_HOOKS)
            source_context = context_for(root, source_directory, source_state, lock_fd)
            require(invoke(source_profile, "database", "inspect", source_context), "migration_running", False)
            require(invoke(source_profile, "runtime", "maintenance-on", source_context), "maintenance")
            require(invoke(source_profile, "runtime", "stop-candidate", source_context), "stopped")
        elif repair_from:
            raise ReleaseError("No unfinished release matches --repair-from")
        current = read(root / "current.json") if (root / "current.json").exists() else None
        if source_state is not None:
            current = source_state["previous"]
        if adopt and current:
            raise ReleaseError("Target already adopted")
        if not adopt and not current:
            raise ReleaseError("Existing production must be imported with adopt first")
        directory = snapshot(root, bundle, manifest)
        state = {
            "version": VERSION,
            "release_id": manifest["release_id"],
            "status": "running",
            "kind": "adopt" if adopt else "release",
            "phase": "preflight",
            "migration_started": bool(repair_from),
            "repair_from": repair_from,
            "previous": current,
            "results": {},
        }
        write(directory / "state.json", state)
        write(root / "active.json", {"release_id": state["release_id"]})
        if source_state is not None:
            source_state.update(status="superseded", repaired_by=state["release_id"])
            write(source_directory / "state.json", source_state)

        def step(capability, action, field=None):
            state["phase"] = f"{capability}.{action}"
            write(directory / "state.json", state)
            result = invoke(profile, capability, action, context_for(root, directory, state, lock_fd))
            if field:
                require(result, field)
            state["results"][state["phase"]] = result
            write(directory / "state.json", state)
            return result

        try:
            if not adopt:
                step("registry", "pull", "pulled")
            observed = step("runtime", "inspect")
            if adopt and observed.get("artifacts"):
                manifest["artifacts"] = observed["artifacts"]
                manifest["runtime"] = observed.get("runtime", {})
                write(directory / "bundle/manifest.json", manifest)
                seal_snapshot(directory)
            step("runtime", "preflight", "ready")
            require(step("database", "inspect"), "migration_running", False)
            if adopt:
                step("runtime", "adopt", "adopted")
                step("runtime", "verify", "ready")
            else:
                step("storage", "preflight", "ready")
                step("runtime", "maintenance-on", "maintenance")
                step("runtime", "drain", "stopped")
                backup = step("database", "backup")
                require(backup, "backup_id", state["release_id"])
                files = backup.get("files", [])
                if not files:
                    raise ReleaseError("Backup has no files")
                for item in files:
                    path = Path(item["path"]).resolve()
                    if not path.is_relative_to((directory / "work").resolve()) or not path.is_file():
                        raise ReleaseError("Backup file outside release workspace")
                    if file_hash(path) != item.get("sha256"):
                        raise ReleaseError("Backup checksum mismatch")
                storage_reference = None
                for action, field in (("put", None), ("verify", "verified"), ("commit", "complete")):
                    stored = step("storage", action, field)
                    require(stored, "backup_id", state["release_id"])
                    if not isinstance(stored.get("reference"), str) or not stored["reference"]:
                        raise ReleaseError("Backup storage reference is missing")
                    if storage_reference is not None and stored["reference"] != storage_reference:
                        raise ReleaseError("Backup storage reference changed during verification")
                    storage_reference = stored["reference"]
                state["migration_started"] = True
                migrated = step("database", "migrate")
                if not migrated.get("revisions") or migrated.get("revisions") != migrated.get("target_revisions"):
                    raise ReleaseError("Database revisions do not match migration target")
                step("runtime", "start", "started")
                step("runtime", "verify", "ready")
                step("runtime", "commit", "committed")
            # Keep active.json until both pointer update and traffic restoration have completed.
            write(root / "current.json", {"release_id": state["release_id"]})
            if not adopt:
                result = step("runtime", "maintenance-off")
                require(result, "maintenance", False)
            state.update(status="success", phase="complete")
            write(directory / "state.json", state)
            (root / "active.json").unlink()
            return state
        except BaseException as error:
            state["status"] = "failed"
            state["error"] = type(error).__name__
            write(directory / "state.json", state)
            if state["migration_started"] and state["phase"] in (
                "runtime.start",
                "runtime.verify",
                "runtime.commit",
                "runtime.maintenance-off",
            ):
                try:
                    require(
                        invoke(profile, "runtime", "stop-candidate", context_for(root, directory, state, lock_fd)),
                        "stopped",
                    )
                    state["cleanup"] = "stopped"
                except BaseException:
                    state["cleanup"] = "failed"
                write(directory / "state.json", state)
            changed = "runtime.maintenance-on" in state["results"] or state["phase"] == "runtime.maintenance-on"
            if adopt and state["phase"] not in ("runtime.adopt", "runtime.verify"):
                state["status"] = "aborted"
                write(directory / "state.json", state)
                (root / "active.json").unlink(missing_ok=True)
            if not state["migration_started"] and not adopt:
                if changed:
                    try:
                        restore(root, directory, state, lock_fd)
                    except BaseException:
                        state["status"] = "recovery-failed"
                        write(directory / "state.json", state)
                else:
                    state["status"] = "aborted"
                    write(directory / "state.json", state)
                    (root / "active.json").unlink()
            raise


def restore(root, directory, state, lock_fd):
    profile = load_profile(directory / "bundle/profile.json", TARGET_HOOKS)
    context = context_for(root, directory, state, lock_fd)
    if state["migration_started"]:
        compatible = invoke(profile, "database", "check-compatibility", context)
        require(compatible, "compatible")
        stopped = invoke(profile, "runtime", "stop-candidate", context)
        require(stopped, "stopped")
    previous = state["previous"]
    if previous is None:
        if state["kind"] != "adopt":
            raise ReleaseError("No previous version to restore")
        previous = {"release_id": state["release_id"]}
    old_directory = root / "releases" / identity(previous["release_id"])
    old_state = read(old_directory / "state.json")
    old_profile = load_profile(old_directory / "bundle/profile.json", TARGET_HOOKS)
    old_context = context_for(root, old_directory, old_state, lock_fd)
    restored = invoke(old_profile, "runtime", "recover", old_context)
    require(restored, "restored")
    require(invoke(old_profile, "runtime", "verify", old_context), "ready")
    require(invoke(old_profile, "runtime", "maintenance-off", old_context), "maintenance", False)
    write(root / "current.json", previous)
    state.update(status="recovered", phase="recovered")
    write(directory / "state.json", state)
    (root / "active.json").unlink(missing_ok=True)


def recover(root, bundle):
    release_id = bundle_manifest(bundle)["release_id"]
    with target_lock(root) as lock_fd:
        active = unfinished(root)
        if not active:
            state = read(root / "releases" / release_id / "state.json")
            if state["status"] in ("success", "recovered"):
                return state
            raise ReleaseError("No unfinished release to recover")
        if active["release_id"] != release_id:
            raise ReleaseError("Recovery must target the unfinished release")
        directory = root / "releases" / release_id
        state = read(directory / "state.json")
        restore(root, directory, state, lock_fd)
        return state


def freeze(source, profile, destination):
    if destination.resolve().is_relative_to((source / "deploy").resolve()):
        raise ReleaseError("Build destination must be outside the deploy code tree")
    destination.mkdir(parents=True, mode=0o700)
    shutil.copytree(
        source / "deploy",
        destination / "deploy",
        ignore=shutil.ignore_patterns("tests", "__pycache__", ".pytest_cache", "*.pyc"),
    )
    shutil.copy2(profile, destination / "profile.json")


def build(args):
    profile = load_profile(args.profile, ("build", "registry"))
    identity(args.release_id)
    if not re.fullmatch(r"[0-9a-f]{40,64}", args.commit) or not re.fullmatch(r"v\d+\.\d+\.\d+", args.tag):
        raise ReleaseError("A release needs a full commit SHA and vMAJOR.MINOR.PATCH tag")
    if args.work_dir.exists():
        raise ReleaseError("Build directory exists; use a fresh release ID/directory")
    freeze(args.source_root, args.profile, args.work_dir)
    manifest = {"version": VERSION, "release_id": args.release_id, "commit": args.commit, "tag": args.tag}
    context = {
        "release_id": args.release_id,
        "manifest": manifest,
        "bundle": str(args.work_dir),
        "source_root": str(args.source_root),
        "work_dir": str(args.work_dir / "work"),
        "results": {},
    }
    context["results"]["build.build"] = invoke(profile, "build", "build", context)
    published = invoke(profile, "registry", "publish", context)
    if not published.get("artifacts") or not isinstance(published["artifacts"], dict):
        raise ReleaseError("Publish hook must return immutable artifact references")
    manifest["artifacts"] = published["artifacts"]
    write(args.work_dir / "manifest.json", manifest)
    shutil.rmtree(args.work_dir / "work")
    return manifest


def dispatch(args):
    source = args.bundle.resolve()
    manifest = bundle_manifest(source)
    # Each manual attempt reuses built artifacts but has its own target journal and backup identity.
    with tempfile.TemporaryDirectory(prefix="release-dispatch-") as temporary:
        bundle = Path(temporary) / "bundle"
        shutil.copytree(source, bundle)
        manifest["build_id"] = manifest["release_id"]
        manifest["release_id"] = identity(manifest["release_id"][:63] + "-" + uuid4().hex)
        print(f"Release attempt: {manifest['release_id']}", file=sys.stderr, flush=True)
        write(bundle / "manifest.json", manifest)
        profile = load_profile(bundle / "profile.json", ("config", "transport"))
        context = {
            "release_id": manifest["release_id"],
            "manifest": manifest,
            "bundle": str(bundle),
            "work_dir": str(bundle / "dispatch-work"),
            "results": {},
            "config_file": str(args.config_file.resolve()),
            "repair_from": identity(args.repair_from) if args.repair_from else None,
        }
        materialized = invoke(profile, "config", "materialize", context)
        if Path(materialized.get("env_file", "")).resolve() != bundle / "runtime.env":
            raise ReleaseError("Config hook must materialize bundle/runtime.env")
        if not (bundle / "runtime.env").is_file():
            raise ReleaseError("Configuration was not materialized")
        context["results"]["config.materialize"] = materialized
        # Deliver credentials from the selected target hooks, without vendor names in the transport.
        load_profile(bundle / "profile.json", TARGET_HOOKS)
        names = set()
        for capability in TARGET_HOOKS:
            hook = profile["hooks"][capability]
            names.update(hook.get("env", []))
            for action, values in hook.get("env_by_action", {}).items():
                if capability != "registry" or action == "pull":
                    names.update(values)
        credentials = {name: os.environ[name] for name in names if name in os.environ}
        credentials_path = bundle / "credentials.json"
        if credentials_path.exists():
            supplied = read(credentials_path)
            if (
                not isinstance(supplied, dict)
                or not set(supplied).issubset(names)
                or not all(isinstance(value, str) for value in supplied.values())
            ):
                raise ReleaseError("Config hook supplied undeclared target credentials")
            credentials.update(supplied)
        write(credentials_path, credentials)
        return invoke(profile, "transport", "dispatch", context)


def main():
    os.umask(0o077)
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    for name in ("release", "adopt", "recover", "status", "dispatch"):
        child = commands.add_parser(name)
        child.add_argument("--bundle", type=Path, required=True)
        if name in ("release", "dispatch"):
            child.add_argument("--repair-from")
        if name == "dispatch":
            child.add_argument("--config-file", type=Path, required=True)
        else:
            child.add_argument("--root", type=Path, required=True)
    child = commands.add_parser("build")
    child.add_argument("--profile", type=Path, required=True)
    child.add_argument("--source-root", type=Path, default=Path(__file__).resolve().parents[1])
    child.add_argument("--work-dir", type=Path, required=True)
    for name in ("release-id", "commit", "tag"):
        child.add_argument("--" + name, required=True)
    args = parser.parse_args()
    try:
        if args.command == "build":
            result = build(args)
        elif args.command == "dispatch":
            result = dispatch(args)
        else:
            root, bundle = args.root.resolve(), args.bundle.resolve()
            if args.command == "status":
                result = read(root / "releases" / bundle_manifest(bundle)["release_id"] / "state.json")
            elif args.command == "recover":
                result = recover(root, bundle)
            else:
                result = operation(root, bundle, args.command == "adopt", getattr(args, "repair_from", None))
        # State files contain hook artifacts; only expose a compact, non-secret summary.
        print(
            json.dumps(
                {key: result[key] for key in ("version", "release_id", "status", "phase", "artifacts") if key in result}
            )
        )
    except (ReleaseError, OSError, ValueError, KeyError, subprocess.SubprocessError) as error:
        message = str(error) if isinstance(error, ReleaseError) else type(error).__name__
        print(f"Release failed: {message}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
