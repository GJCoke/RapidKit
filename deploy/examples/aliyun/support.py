"""Utilities shared only by these example hooks, never by the release core."""

import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
from pathlib import Path


class HookError(Exception):
    pass


def required(name):
    value = os.environ.get(name, "")
    if not value:
        raise HookError(f"Missing setting: {name}")
    return value


def read(path):
    return json.loads(Path(path).read_text())


def save(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(value, indent=2))
    temporary.chmod(0o600)
    os.replace(temporary, path)


def sha256(path):
    digest = hashlib.sha256()
    with Path(path).open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def run(command, *, input=None, output=None, env=None, probe=False):
    result = subprocess.run(
        command, input=input, stdout=output or subprocess.PIPE, stderr=subprocess.PIPE, env=env, text=output is None
    )
    if result.returncode:
        if probe and isinstance(result.stdout, str):
            for line in result.stdout.splitlines():
                if line.startswith("RELEASE_ERROR="):
                    try:
                        payload = json.loads(line.removeprefix("RELEASE_ERROR="))
                        fields = [
                            name
                            for name in payload.get("fields", [])
                            if isinstance(name, str) and re.fullmatch(r"[A-Z][A-Z0-9_]*", name)
                        ]
                    except (ValueError, AttributeError, TypeError):
                        break
                    raise HookError("Application probe failed; check settings: " + ", ".join(fields))
        # External stderr may contain connection strings or file contents.
        raise HookError(f"{Path(command[0]).name} failed (exit {result.returncode})")
    return result.stdout if output is None else ""


def project(context):
    return context["options"].get("project_name", "rapidkit-prod")


def container_ids(context, services=None):
    services = services or ["backend-api", "celery-beat", *context["options"].get("worker_services", ["celery-worker"])]
    ids = []
    for service in services:
        ids.extend(
            run(
                [
                    "docker",
                    "ps",
                    "-aq",
                    "--filter",
                    f"label=com.docker.compose.project={project(context)}",
                    "--filter",
                    f"label=com.docker.compose.service={service}",
                ]
            ).split()
        )
    return ids


def worker_token(context):
    return hashlib.sha256(context["release_id"].encode()).hexdigest()[:32]


def environment(context):
    # Compose takes application settings from --env-file; inherited CI values cannot override them.
    return {
        **{key: os.environ[key] for key in ("PATH", "HOME", "DOCKER_CONFIG") if key in os.environ},
        "RAPIDKIT_ENV_FILE": context["env_file"],
        "CELERY_WORKER_DEPLOYMENT": worker_token(context),
    }


def compose(context):
    bundle = Path(context["bundle"])
    override = Path(context["work_dir"]) / "compose.override.json"
    services = {}
    images = context["manifest"].get("artifacts", {})
    workers = context["options"].get("worker_services", ["celery-worker"])
    for service in ("backend-api", "backend-migrate", "celery-beat", *workers, "nginx"):
        image = images.get(service) or images.get("frontend" if service == "nginx" else "backend")
        if not image:
            raise HookError(f"Missing immutable image: {service}")
        services[service] = {
            "image": image,
            "labels": {"io.rapidkit.release-managed": "true"},
            **context["manifest"].get("runtime", {}).get(service, {}),
        }
        if context.get("inventory_recovery") and service in workers:
            services[service].setdefault("environment", {})["CELERY_WORKER_DEPLOYMENT"] = worker_token(context)
    services["nginx"]["volumes"] = [
        f"{Path(context['root']) / 'maintenance'}:/run/rapidkit-release:ro",
        f"{Path(context['work_dir']) / 'nginx.conf'}:/etc/nginx/templates/nginx.conf.template:ro",
    ]
    base = (bundle / "docker/prod/nginx.conf").read_text()
    needle = "        listen 80;"
    if base.count(needle) != 1:
        raise HookError("Expected a single nginx application server")
    # The error page is served as a static named location to avoid recursively testing the flag.
    maintenance = """        error_page 503 @release_maintenance;
        if (-f /run/rapidkit-release/enabled) { return 503; }
        location @release_maintenance {
            default_type text/html;
            add_header Retry-After 60 always;
            return 503 '<meta charset="UTF-8"><h1>系统维护中</h1><p>请稍后重试。</p>';
        }
"""
    Path(context["work_dir"]).mkdir(parents=True, exist_ok=True)
    maintenance_directory = Path(context["root"]) / "maintenance"
    maintenance_directory.mkdir(parents=True, exist_ok=True, mode=0o755)
    # Hook umask is 077; nginx workers still need to stat this non-secret flag.
    maintenance_directory.chmod(0o755)
    (Path(context["work_dir"]) / "nginx.conf").write_text(base.replace(needle, needle + "\n" + maintenance))
    save(override, {"services": services})
    files = [str(bundle / "docker/prod/docker-compose.yml")]
    for value in context["options"].get("compose_files", []):
        path = Path(value).resolve()
        if not path.is_file() or not path.is_relative_to(bundle.resolve()):
            raise HookError("Extra Compose files must be inside the versioned bundle")
        files.append(str(path))
    files.append(str(override))
    return [
        "docker",
        "compose",
        "--project-name",
        project(context),
        "--env-file",
        context["env_file"],
        *[value for file in files for value in ("-f", file)],
    ]


def compose_run(context, arguments, **kwargs):
    return run([*compose(context), *arguments], env=environment(context), **kwargs)


def resolved(context):
    config = json.loads(compose_run(context, ["config", "--format", "json"]))
    # Compose emits a re-usable model, escaping literal dollars for another interpolation pass.
    for service in config["services"].values():
        for key, value in service.get("environment", {}).items():
            if isinstance(value, str):
                service["environment"][key] = value.replace("$$", "$")
    return config


def main(execute):
    os.umask(0o077)
    parser = argparse.ArgumentParser()
    parser.add_argument("action")
    parser.add_argument("--context", type=Path, required=True)
    parser.add_argument("--result", type=Path, required=True)
    args = parser.parse_args()
    context = read(args.context)
    try:
        data = execute(args.action, context)
        save(
            args.result,
            {
                "version": 1,
                "release_id": context["release_id"],
                "capability": context["capability"],
                "action": args.action,
                "data": data,
            },
        )
    except Exception as error:
        message = str(error) if isinstance(error, HookError) else type(error).__name__
        save(
            args.result,
            {
                "version": 1,
                "release_id": context["release_id"],
                "capability": context["capability"],
                "action": args.action,
                "data": {},
                "error": message,
            },
        )
        print(message, file=sys.stderr)
        return 1
    return 0
