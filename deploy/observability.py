#!/usr/bin/env python3
"""Host-only Compose log preparation, discovery and stopped-instance maintenance (Python 3.10+)."""

import argparse
import json
import os
import re
import stat
import subprocess
import time
from pathlib import Path
from uuid import uuid4

ROLES = {"backend-api": "api", "celery-worker": "worker", "celery-beat": "beat", "backend-migrate": "migrate"}


def atomic_json(path, value):
    temporary = path.with_name(path.name + "." + uuid4().hex)
    temporary.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")
    temporary.chmod(0o644)
    os.replace(temporary, path)


def prepare(log_root, state_root, uid, gid):
    for root in (log_root, state_root):
        if root.is_symlink():
            raise ValueError("A managed root must not be a symlink")
        root.mkdir(parents=True, exist_ok=True, mode=0o755)
    for role in ROLES.values():
        path = log_root / role
        if path.is_symlink():
            raise ValueError("A log directory must not be a symlink")
        if not path.exists():
            path.mkdir(mode=0o750)
            os.chown(path, uid, gid)
        metadata = path.stat()
        if not path.is_dir() or (metadata.st_uid, metadata.st_gid) != (uid, gid):
            raise ValueError("Existing directory ownership does not match image UID/GID; inspect explicitly")
    if not (state_root / "targets.json").exists():
        atomic_json(state_root / "targets.json", [])


def inspect_containers(project, network):
    ids = subprocess.check_output(
        ["docker", "ps", "-aq", "--no-trunc", "--filter", "label=com.docker.compose.project=" + project], text=True
    ).split()
    rows = []
    for container in ids:
        # Never persist/log Config.Env or the unrestricted inspection result.
        template = (
            '{{json .Config.Hostname}} {{json (index .Config.Labels "com.docker.compose.service")}} '
            "{{json .State.Running}} {{json .NetworkSettings.Networks}}"
        )
        raw = subprocess.check_output(["docker", "inspect", "--format", template, container], text=True)
        decoder = json.JSONDecoder()
        values = []
        for _ in range(4):
            value, end = decoder.raw_decode(raw.lstrip())
            values.append(value)
            raw = raw.lstrip()[end:]
        hostname, service, running, networks = values
        if service in ROLES:
            rows.append(
                {
                    "id": container,
                    "hostname": hostname,
                    "service": service,
                    "running": running,
                    "address": networks.get(network, {}).get("IPAddress", ""),
                }
            )
    return rows


def refresh(state_root, project, network):
    rows = inspect_containers(project, network)
    path = state_root / "inventory.json"
    previous = json.loads(path.read_text()) if path.exists() else {"instances": {}}
    if previous.get("project", project) != project:
        raise ValueError("Inventory belongs to another Compose project")
    instances = {key: {**value, "running": False} for key, value in previous["instances"].items()}
    targets = []
    for row in rows:
        hostname = row["hostname"]
        if re.fullmatch("[a-f0-9]{12}", hostname) and row["id"].startswith(hostname):
            instances[hostname] = row
        role = ROLES[row["service"]]
        if row["running"] and row["address"] and role != "migrate":
            port = 8006 if role == "api" else 9008
            targets.append({"targets": [row["address"] + ":" + str(port)], "labels": {"service": role}})
    state = {"project": project, "network": network, "updated_at": time.time(), "instances": instances}
    atomic_json(path, state)
    atomic_json(state_root / "targets.json", targets)
    return state


def cleanup(log_root, state_root, project, network, *, apply=False, days=7):
    state = refresh(state_root, project, network)
    cutoff, count = time.time() - days * 86400, 0
    # A removed Docker ID cannot be restarted; stopped-but-existing IDs remain protected.
    present = {row["id"] for row in inspect_containers(project, network)}
    for hostname, instance in state["instances"].items():
        if instance["running"] or instance["id"] in present:
            continue
        directory = log_root / ROLES[instance["service"]]
        if directory.is_symlink():
            continue
        pattern = re.compile(
            r"(?:access|error)\."
            + re.escape(hostname)
            + r"\.[1-9][0-9]*(?:\.[0-9]{4}-[0-9]{2}-[0-9]{2}(?:-[1-9][0-9]*)?)?\.log"
        )
        for path in directory.iterdir():
            metadata = path.stat(follow_symlinks=False)
            if stat.S_ISREG(metadata.st_mode) and metadata.st_mtime < cutoff and pattern.fullmatch(path.name):
                count += 1
                if apply:
                    path.unlink()
    return count


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("prepare", "refresh", "cleanup", "watch"))
    parser.add_argument("--log-root", type=Path, default=Path("/var/lib/rapidkit/logs"))
    parser.add_argument("--state-root", type=Path, default=Path("/var/lib/rapidkit/observability"))
    parser.add_argument("--project", default="rapidkit-prod")
    parser.add_argument("--network", default="rapidkit-prod-network")
    parser.add_argument("--uid", type=int, default=999)
    parser.add_argument("--gid", type=int, default=999)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    if args.command == "prepare":
        prepare(args.log_root, args.state_root, args.uid, args.gid)
    elif args.command == "refresh":
        refresh(args.state_root, args.project, args.network)
    elif args.command == "cleanup":
        print(
            json.dumps(
                {
                    "eligible_files": cleanup(
                        args.log_root, args.state_root, args.project, args.network, apply=args.apply
                    )
                }
            )
        )
    else:
        while True:
            try:
                cleanup(args.log_root, args.state_root, args.project, args.network, apply=args.apply)
            except (OSError, ValueError, subprocess.SubprocessError) as error:
                print(
                    json.dumps({"event": "host.observability.failed", "exception_type": type(error).__name__}),
                    flush=True,
                )
            time.sleep(10)


if __name__ == "__main__":
    main()
