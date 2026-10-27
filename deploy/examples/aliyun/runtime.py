"""Example Compose runtime hook. Owns no database migration or OSS upload."""

import json
import re
import shutil
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

from support import (
    HookError,
    compose_run,
    container_ids,
    main,
    read,
    resolved,
    run,
    save,
    worker_token,
)

STABLE_SETTINGS = (
    "POSTGRESQL_HOST",
    "POSTGRESQL_PORT",
    "POSTGRESQL_USERNAME",
    "POSTGRESQL_DATABASE",
    "POSTGRESQL_PASSWORD",
    "REDIS_HOST",
    "REDIS_PORT",
    "REDIS_DATABASE",
    "REDIS_ROOT_PASSWORD",
    "CELERY_REDIS_DATABASE",
    "MINIO_ROOT_USER",
    "MINIO_ROOT_PASSWORD",
    "ACCESS_TOKEN_KEY",
    "REFRESH_TOKEN_KEY",
    "IMPERSONATION_TOKEN_KEY",
    "RSA_PRIVATE_KEY",
    "RSA_PUBLIC_KEY",
)


def workers(context):
    return context["options"].get("worker_services", ["celery-worker"])


def inspect(identifier):
    return json.loads(run(["docker", "inspect", identifier]))[0]


def running(identifier):
    state = inspect(identifier)["State"]
    return state["Running"] or state.get("Restarting", False)


def wait_stopped(context, services):
    identifiers = container_ids(context, services)
    for identifier in identifiers:
        # Prevent a Docker restart or daemon reboot from undoing the maintenance boundary.
        run(["docker", "update", "--restart=no", identifier])
        if running(identifier):
            run(["docker", "kill", "--signal=TERM", identifier])
    deadline = context.get("drain_deadline", time.monotonic() + context["options"].get("drain_timeout", 600))
    while any(running(identifier) for identifier in identifiers):
        if time.monotonic() >= deadline:
            raise HookError("Graceful shutdown timed out; no SIGKILL sent; maintenance remains active")
        time.sleep(1)


def application(context, action, identifier=None):
    script = (Path(context["bundle"]) / "deploy/examples/aliyun/application.py").read_text()
    if identifier:
        output = run(["docker", "exec", "-i", identifier, "python", "-", action], input=script, probe=True)
    else:
        output = compose_run(
            context, ["run", "--rm", "--no-deps", "-T", "backend-api", "python", "-", action], input=script, probe=True
        )
    return json.loads(
        next(line.removeprefix("RELEASE_JSON=") for line in output.splitlines() if line.startswith("RELEASE_JSON="))
    )


def groups(context):
    config = resolved(context)
    target = workers(context)
    actual = {
        name for name, spec in config["services"].items() if "plugin_worker.launcher" in (spec.get("command") or [])
    }
    if not context.get("kind") == "adopt" and actual != set(target):
        raise HookError("Select all worker services; example only supports launcher-managed worker services")
    result = {}
    for service in target:
        spec = config["services"][service]
        group = spec.get("environment", {}).get("CELERY_WORKER_GROUP")
        replicas = spec.get("deploy", {}).get("replicas")
        if not isinstance(group, str) or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9/_.-]{0,127}", group):
            raise HookError("Invalid worker group")
        if type(replicas) is not int or replicas < 0:
            raise HookError("Invalid desired replica count")
        result.setdefault(group, {"replicas": 0, "services": {}})
        result[group]["replicas"] += replicas
        result[group]["services"][service] = replicas
    return result


def inventory(context, action, group, replicas):
    compose_run(
        context,
        [
            "run",
            "--rm",
            "--no-deps",
            "-T",
            "backend-api",
            "python",
            "-m",
            "plugin_worker.deployment",
            action,
            "--group",
            group,
            "--deployment",
            worker_token(context),
            "--replicas",
            str(replicas),
        ],
    )


def status_code(context):
    url = context["options"].get("public_url", "http://127.0.0.1:18080/")
    try:
        with urllib.request.urlopen(url, timeout=5) as response:
            return response.status
    except urllib.error.HTTPError as error:
        return error.code


def start(context, include_beat=False):
    capacities = groups(context)
    scales = [
        value
        for spec in capacities.values()
        for service, count in spec["services"].items()
        for value in ("--scale", f"{service}={count}")
    ]
    services = ["backend-api", *workers(context), "nginx"]
    if include_beat:
        services += ["celery-beat"]
    compose_run(
        context, ["up", "-d", "--no-deps", "--no-build", "--pull", "never", "--force-recreate", *scales, *services]
    )


def verify(context):
    deadline = time.monotonic() + context["options"].get("startup_timeout", 180)
    while True:
        try:
            apis = container_ids(context, ["backend-api"])
            if not apis or not all(running(identifier) for identifier in apis):
                raise HookError("API is not running")
            for identifier in apis:
                run(
                    [
                        "docker",
                        "exec",
                        identifier,
                        "python",
                        "-c",
                        "import urllib.request; "
                        "urllib.request.urlopen('http://localhost:8006/health/ready', timeout=3).read()",
                    ]
                )
            config = resolved(context)
            for service in workers(context):
                identifiers = container_ids(context, [service])
                # ps -a includes stopped zero-replica containers; only running ones count.
                identifiers = [identifier for identifier in identifiers if running(identifier)]
                expected = config["services"][service]["deploy"]["replicas"]
                if len(identifiers) != expected:
                    raise HookError("Worker replica count is not ready")
                for identifier in identifiers:
                    result = application(context, "worker", identifier)
                    if not result.get("ready"):
                        raise HookError("Worker did not respond")
                    if context.get("kind") != "adopt":
                        group = config["services"][service]["environment"]["CELERY_WORKER_GROUP"]
                        if result.get("deployment") != worker_token(context) or result.get("group") != group:
                            raise HookError("Worker deployment/group does not match")
            nginx = container_ids(context, ["nginx"])
            if len(nginx) != 1 or not running(nginx[0]):
                raise HookError("Nginx is not ready")
            run(["docker", "exec", nginx[0], "nginx", "-t"])
            expected_code = 503 if (Path(context["root"]) / "maintenance/enabled").exists() else 200
            if status_code(context) != expected_code:
                raise HookError("Public entry is not in expected maintenance state")
            return {"ready": True}
        except (HookError, OSError, ValueError, StopIteration):
            if time.monotonic() >= deadline:
                raise HookError("Application readiness timed out; maintenance retained") from None
            time.sleep(2)


def validate_current(context, config, info):
    candidate = config["services"]["backend-api"].get("environment", {})
    old = dict(value.split("=", 1) for value in info["Config"]["Env"] if "=" in value)
    defaults = {"REDIS_DATABASE": "0", "CELERY_REDIS_DATABASE": "1", "POSTGRESQL_PORT": "5432"}
    for key in STABLE_SETTINGS:
        if (key in old or key in defaults) and candidate.get(key, defaults.get(key, "")) != old.get(
            key, defaults.get(key)
        ):
            raise HookError(f"Separate maintenance procedure required for setting: {key}")
    networks = {config["networks"][name]["name"] for name in config["services"]["backend-api"].get("networks", {})}
    if not networks or networks != set(info["NetworkSettings"]["Networks"]):
        raise HookError("Changing the existing application network requires separate maintenance")
    observed = context.get("results", {}).get("runtime.inspect", {}).get("runtime", {})
    for service in workers(context):
        prior_group = observed.get(service, {}).get("environment", {}).get("CELERY_WORKER_GROUP")
        next_group = config["services"].get(service, {}).get("environment", {}).get("CELERY_WORKER_GROUP")
        if prior_group and prior_group != next_group:
            raise HookError(
                "Changing an existing worker group requires separate maintenance; add a new service instead"
            )
    if context.get("previous"):
        previous = context["previous"]["release_id"]
        old_profile = read(Path(context["root"]) / "releases" / previous / "bundle/profile.json")
        old_workers = old_profile["hooks"]["runtime"].get("options", {}).get("worker_services", ["celery-worker"])
        if not set(old_workers).issubset(workers(context)):
            raise HookError("Keep existing worker service names; pause with replicas=0 before a separate removal")


def execute(action, context):
    if action == "inspect":
        artifacts, runtime = {}, {}
        for service in ["backend-api", "celery-beat", *workers(context), "nginx"]:
            identifiers = container_ids(context, [service])
            active = [inspect(identifier) for identifier in identifiers if running(identifier)]
            if not active and context.get("repair_from"):
                active = [inspect(identifier) for identifier in identifiers]
            if not active:
                if service in workers(context) or (context.get("repair_from") and service == "celery-beat"):
                    continue
                raise HookError(f"Existing production service is missing: {service}")
            if len({item["Image"] for item in active}) != 1:
                raise HookError("Existing service has mixed images; adopt only a stable release")
            item = active[0]
            artifacts[service] = item["Image"]
            runtime[service] = {"command": item["Config"]["Cmd"], "entrypoint": item["Config"]["Entrypoint"]}
            if service in workers(context):
                values = dict(value.split("=", 1) for value in item["Config"]["Env"] if "=" in value)
                runtime[service]["environment"] = {
                    key: values[key] for key in ("CELERY_WORKER_GROUP", "CELERY_WORKER_DEPLOYMENT") if key in values
                }
                runtime[service]["deploy"] = {"replicas": len(active)}
            if context.get("kind") == "adopt":
                run(["docker", "image", "tag", item["Image"], f"rapidkit-adopt/{service}:{context['release_id']}"])
        artifacts["backend-migrate"] = artifacts["backend-api"]
        artifacts["backend"] = artifacts["backend-api"]
        artifacts["frontend"] = artifacts["nginx"]
        return {"artifacts": artifacts, "runtime": runtime}
    if action == "preflight":
        if shutil.disk_usage(context["root"]).free < context["options"].get("minimum_free_bytes", 2 * 1024**3):
            raise HookError("Insufficient free disk space")
        run(["docker", "version"])
        run(["docker", "compose", "version"])
        for service in ("postgresql", "redis", "minio"):
            identifiers = container_ids(context, [service])
            if len(identifiers) != 1:
                raise HookError(f"Expected existing infrastructure: {service}")
            info = inspect(identifiers[0])["State"]
            if not info["Running"] or info.get("Health", {}).get("Status") != "healthy":
                raise HookError(f"Infrastructure is unhealthy: {service}")
        config = resolved(context)
        current = container_ids(context, ["backend-api"])
        if not current:
            raise HookError("No existing API; explicit adoption required")
        validate_current(context, config, inspect(current[0]))
        compose_run(context, ["run", "--rm", "--no-deps", "-T", "nginx", "nginx", "-t"])
        probe = application(context, "config")
        groups(context)
        return {"ready": True, "inventory_supported": probe.get("inventory_supported", False)}
    if action == "adopt":
        compose_run(context, ["up", "-d", "--no-deps", "--no-build", "--pull", "never", "--force-recreate", "nginx"])
        return {"adopted": True}
    if action in ("maintenance-on", "maintenance-off"):
        marker = Path(context["root"]) / "maintenance/enabled"
        marker.parent.mkdir(parents=True, exist_ok=True, mode=0o755)
        marker.parent.chmod(0o755)
        if action == "maintenance-on":
            marker.touch(mode=0o644)
            if status_code(context) != 503:
                raise HookError("Entry did not enter maintenance")
            return {"maintenance": True}
        marker.unlink(missing_ok=True)
        try:
            if status_code(context) != 200:
                raise HookError("Public entry did not recover")
        except BaseException:
            marker.touch(mode=0o644)
            raise
        return {"maintenance": False}
    if action in ("drain", "stop-candidate"):
        context = {**context, "drain_deadline": time.monotonic() + context["options"].get("drain_timeout", 600)}
        wait_stopped(context, ["celery-beat"])
        wait_stopped(context, ["backend-api"])
        wait_stopped(context, workers(context))
        if action == "stop-candidate":
            intents = Path(context["work_dir"]) / "intents.json"
            if intents.exists():
                saved = read(intents)
                pending = application(context, "inventory")["pending"]
                for group, spec in saved.items():
                    if spec["pending"] and pending.get(group) == worker_token(context):
                        inventory(context, "abort", group, spec["replicas"])
                        spec["pending"] = False
                save(intents, saved)
        return {"stopped": True}
    if action == "start":
        intents = {}
        for group, spec in groups(context).items():
            intents[group] = {"replicas": spec["replicas"], "pending": True}
            save(Path(context["work_dir"]) / "intents.json", intents)
            inventory(context, "prepare", group, spec["replicas"])
        start(context)
        return {"started": True, "worker_deployment": worker_token(context)}
    if action == "verify":
        return verify(context)
    if action == "commit":
        compose_run(
            context, ["up", "-d", "--no-deps", "--no-build", "--pull", "never", "--force-recreate", "celery-beat"]
        )
        deadline = time.monotonic() + context["options"].get("startup_timeout", 180)
        while True:
            identifiers = container_ids(context, ["celery-beat"])
            if (
                len(identifiers) == 1
                and running(identifiers[0])
                and application(context, "beat", identifiers[0])["ready"]
            ):
                break
            if time.monotonic() >= deadline:
                raise HookError("Beat leadership readiness timed out")
            time.sleep(2)
        intents = read(Path(context["work_dir"]) / "intents.json")
        for group, spec in intents.items():
            inventory(context, "finish", group, spec["replicas"])
            spec["pending"] = False
            save(Path(context["work_dir"]) / "intents.json", intents)
        return {"committed": True}
    if action == "recover":
        managed = context.get("kind") != "adopt" or context["results"].get("runtime.preflight", {}).get(
            "inventory_supported", False
        )
        context = {**context, "inventory_recovery": managed}
        identifiers = container_ids(context, ["backend-api", "celery-beat", *workers(context)])
        if any(running(identifier) for identifier in identifiers):
            # A partially drained old release may still have active tasks; never overlap it with a replacement.
            wait_stopped(context, ["celery-beat", "backend-api", *workers(context)])
        capacities = groups(context)
        if managed:
            for group, spec in capacities.items():
                inventory(context, "prepare", group, spec["replicas"])
        start(context, include_beat=True)
        verify(context)
        if managed:
            for group, spec in capacities.items():
                inventory(context, "finish", group, spec["replicas"])
        return {"restored": True}
    raise HookError("Unsupported runtime action")


if __name__ == "__main__":
    sys.exit(main(execute))
