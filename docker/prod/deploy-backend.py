#!/usr/bin/env python3
"""Deploy/scale worker services with explicit group capacity and retirement intent."""

import argparse
import json
import os
import re
import subprocess
from pathlib import Path
from uuid import uuid4


def deploy(compose, config, services, deployment, run, *, initialize=True):
    if len(set(services)) != len(services):
        raise ValueError("Worker services must be unique")
    targets = []
    groups = {}
    for service in services:
        spec = config["services"][service]
        group = spec.get("environment", {}).get("CELERY_WORKER_GROUP", "")
        replicas = spec.get("deploy", {}).get("replicas")
        if (
            not isinstance(group, str)
            or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9/_.-]{0,127}", group)
            or type(replicas) is not int
            or replicas < 0
        ):
            raise ValueError(f"{service}: declare CELERY_WORKER_GROUP and nonnegative deploy.replicas")
        if "plugin_worker.launcher" not in (spec.get("command") or []):
            raise ValueError(f"{service}: use plugin_worker.launcher for unique boot identities")
        targets.append((service, replicas))
        groups[group] = groups.get(group, 0) + replicas
    for service, spec in config["services"].items():
        if (
            service not in services
            and "plugin_worker.launcher" in (spec.get("command") or [])
            and spec.get("environment", {}).get("CELERY_WORKER_GROUP") in groups
        ):
            raise ValueError("Include all services belonging to each selected worker group")
    cli = [*compose, "run", "--rm", "--no-deps", "-T", "backend-api", "python", "-m", "plugin_worker.deployment"]
    if initialize:
        run([*compose, "run", "--rm", "-T", "backend-migrate"])
        run([*compose, "up", "-d", "backend-api", "celery-beat"])
    pending = []
    try:
        for group, replicas in groups.items():
            arguments = ["--group", group, "--deployment", deployment]
            run([*cli, "prepare", *arguments, "--replicas", str(replicas)])
            pending.append(arguments)
        scales = [arg for service, replicas in targets for arg in ("--scale", f"{service}={replicas}")]
        run([*compose, "up", "-d", "--no-deps", "--force-recreate", *scales, *services])
        for arguments in pending[:]:
            run([*cli, "finish", *arguments])
            pending.remove(arguments)
    except BaseException:
        for arguments in pending:
            try:
                run([*cli, "abort", *arguments])
            except (OSError, subprocess.CalledProcessError) as recovery_error:
                # Keep the original failure; the token permits explicit recovery.
                print(f"Pending deployment needs recovery: {deployment}, group {arguments[1]}: {recovery_error}")
        raise


def check_manual_mode(container_info):
    containers = json.loads(container_info)
    if any(
        item.get("Config", {}).get("Labels", {}).get("io.rapidkit.release-managed") == "true" for item in containers
    ):
        raise ValueError("This environment is release-managed; use its release hooks instead of deploy-backend.py")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    directory = Path(__file__).resolve().parent
    parser.add_argument("--env-file", default=str(directory / ".env.prod"))
    parser.add_argument("-f", "--file", action="append")
    parser.add_argument("--service", action="append")
    parser.add_argument("--build", action="store_true")
    parser.add_argument(
        "--workers-only",
        action="store_true",
        help="Unmanaged environments: scale/restart workers without migration or API/Beat updates",
    )
    parser.add_argument("--compose-command", help="JSON command prefix supplied by the RapidKit CLI")
    args = parser.parse_args()
    files = args.file or [str(directory / "docker-compose.yml")]
    compose = ["docker", "compose", "--env-file", args.env_file, *[v for f in files for v in ("-f", f)]]
    if args.compose_command:
        compose = json.loads(args.compose_command)
        if not isinstance(compose, list) or not compose or not all(isinstance(value, str) for value in compose):
            parser.error("Compose command must be a nonempty JSON string array")
    token = uuid4().hex
    env = dict(os.environ, CELERY_WORKER_DEPLOYMENT=token)
    config = json.loads(subprocess.check_output([*compose, "config", "--format", "json"], env=env))

    identifiers = subprocess.check_output([*compose, "ps", "-aq", "backend-api", "nginx"], env=env, text=True).split()
    if identifiers:
        check_manual_mode(subprocess.check_output([compose[0], "inspect", *identifiers], env=env, text=True))

    def run(command):
        subprocess.run(command, env=env, check=True)

    if args.build:
        run([*compose, "build", "backend-api"])
    print(f"Worker deployment: {token}")
    deploy(compose, config, args.service or ["celery-worker"], token, run, initialize=not args.workers_only)


if __name__ == "__main__":
    main()
