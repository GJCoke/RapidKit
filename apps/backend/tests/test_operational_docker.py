"""Production-shaped C exercises; all containers/data belong to a unique disposable project."""

import copy
import json
import os
import subprocess
import time
from datetime import UTC, datetime, timedelta
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from uuid import uuid4

import pytest
from rapidkit_security import generate_rsa_key_pair, serialize_key

ROOT = Path(__file__).resolve().parents[3]
IMAGE = os.getenv("RAPIDKIT_TEST_IMAGE", "rapidkit-backend:observability-c")


def run(*args, timeout=120):
    return subprocess.check_output(list(args), text=True, stderr=subprocess.STDOUT, timeout=timeout)


def fetch(url, payload=None):
    request = Request(
        url,
        data=None if payload is None else json.dumps(payload).encode(),
        headers={} if payload is None else {"Content-Type": "application/json"},
    )
    try:
        response = urlopen(request, timeout=5)
    except HTTPError as error:
        response = error
    with response:
        return response.status, response.read().decode()


def wait(check, seconds=120):
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        try:
            value = check()
            if value:
                return value
        except OSError, URLError, ValueError, KeyError:
            pass
        time.sleep(1)
    raise AssertionError("Operational condition did not become true before deadline")


@pytest.mark.docker
def test_real_persistence_replica_discovery_fault_notifications_and_recovery():
    project = "rapidkit-c-" + uuid4().hex[:8]
    output = ROOT / "logs/verification" / project
    output.mkdir(parents=True)
    managed = output / "managed"
    managed.mkdir()
    network = project + "-network"
    private, public = generate_rsa_key_pair()
    environment = {
        "ENVIRONMENT": "PRODUCTION",
        "EXPOSE_API_DOCS": "false",
        "SENTRY_DSN": "",
        "SENTRY_RELEASE": project,
        "POSTGRESQL_ASYNC_SCHEME": "postgresql+asyncpg",
        "POSTGRESQL_SYNC_SCHEME": "postgresql+psycopg",
        "POSTGRESQL_HOST": "postgresql",
        "POSTGRESQL_PORT": "5432",
        "POSTGRESQL_USERNAME": "test",
        "POSTGRESQL_PASSWORD": "synthetic-postgres-password",
        "POSTGRESQL_DATABASE": "test",
        "REDIS_HOST": "redis",
        "REDIS_PORT": "6379",
        "REDIS_ROOT_PASSWORD": "synthetic-redis-password",
        "REDIS_DATABASE": "9",
        "CELERY_REDIS_DATABASE": "8",
        "MINIO_ROOT_USER": "synthetic",
        "MINIO_ROOT_PASSWORD": "synthetic-minio-password",
        "CORS_ORIGINS": '["http://127.0.0.1"]',
        "CORS_HEADERS": '["*"]',
        "ACCESS_TOKEN_KEY": "synthetic-access-credential-long-enough",
        "REFRESH_TOKEN_KEY": "synthetic-refresh-credential-long-enough",
        "IMPERSONATION_TOKEN_KEY": "synthetic-impersonation-credential-long-enough",
        "RSA_PRIVATE_KEY": serialize_key(private).decode(),
        "RSA_PUBLIC_KEY": serialize_key(public).decode(),
        "SOCKETIO_ADMIN_USERNAME": "synthetic",
        "SOCKETIO_ADMIN_PASSWORD": "synthetic-socket-password",
        "CELERY_WORKER_GROUP": project,
        "LOG_FILE_MIN_FREE_BYTES": "0",
        "LOG_FILE_BUDGET_BYTES": "1048576",
    }
    env_file = output / "runtime.env"
    env_file.write_text("\n".join(key + "=" + json.dumps(value) for key, value in environment.items()) + "\n")
    base = json.loads(
        run(
            "docker",
            "compose",
            "--env-file",
            str(ROOT / "docker/prod/.env.example"),
            "-f",
            str(ROOT / "docker/prod/docker-compose.yml"),
            "config",
            "--no-env-resolution",
            "--format",
            "json",
        )
    )
    services = {key: value for key, value in base["services"].items() if key not in ("minio", "nginx")}
    for name, value in services.items():
        value.pop("build", None)
        value["container_name"] = project + "-" + name
        value["restart"] = "no"
        value["env_file"] = [str(env_file)]
        value["stop_grace_period"] = "10s"
        for mount in value.get("volumes", []):
            if mount["type"] == "bind":
                suffix = mount["source"].split("/logs/", 1)[-1] if "/logs/" in mount["source"] else None
                mount["source"] = (
                    str(managed / "logs" / suffix)
                    if suffix
                    else str(managed / ("logs" if mount["target"] == "/logs" else "discovery"))
                )
        if name in ("backend-api", "backend-migrate", "celery-worker", "celery-beat", "observability"):
            value["image"] = IMAGE
            value.setdefault("environment", {})["LOG_FILE_BUDGET_BYTES"] = "1048576"
            value["environment"]["LOG_FILE_MIN_FREE_BYTES"] = "0"
            value.get("depends_on", {}).pop("minio", None)
    services["postgresql"].update(
        image="postgres:16-alpine",
        environment={
            "POSTGRES_USER": "test",
            "POSTGRES_PASSWORD": environment["POSTGRESQL_PASSWORD"],
            "POSTGRES_DB": "test",
        },
        volumes=[{"type": "volume", "source": "test-pg", "target": "/var/lib/postgresql/data"}],
        healthcheck={
            "test": ["CMD-SHELL", "pg_isready -U test -d test"],
            "interval": "2s",
            "timeout": "2s",
            "retries": 30,
        },
    )
    services["celery-worker"]["command"] = ["python", "-m", "plugin_worker.launcher", "--concurrency", "2"]
    for name, port in (("backend-api", 8006), ("observability", 9009)):
        services[name]["ports"] = [{"target": port, "published": "0", "host_ip": "127.0.0.1", "protocol": "tcp"}]
    # The tested base has no such host ports; loopback publication is only for this local harness.
    services["backend-api"].pop("container_name")
    for name in services:
        assert services[name]["logging"]["options"]["max-size"] == "20m"
    receiver = output / "receiver.py"
    receiver.write_text("""import json
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
messages=[]
class Handler(BaseHTTPRequestHandler):
 def do_POST(self):
  messages.append(json.loads(self.rfile.read(int(self.headers['Content-Length']))))
  self.send_response(200);self.end_headers()
 def do_GET(self):
  self.send_response(200);self.end_headers();self.wfile.write(json.dumps(messages).encode())
 def log_message(self,*args): pass
ThreadingHTTPServer(('0.0.0.0',9095),Handler).serve_forever()
""")
    logging = services["backend-api"]["logging"]
    services["receiver"] = {
        "image": IMAGE,
        "command": ["python", "/receiver.py"],
        "volumes": [str(receiver) + ":/receiver.py:ro"],
        "ports": ["127.0.0.1::9095"],
        "logging": logging,
    }
    webhook = output / "webhook-url"
    webhook.write_text("http://receiver:9095/alerts\n")
    alert_config = output / "alertmanager.yml"
    alert_config.write_text(
        (ROOT / "docker/observability/alertmanager.yml")
        .read_text()
        .replace("group_wait: 10s", "group_wait: 1s")
        .replace("group_interval: 1m", "group_interval: 2s")
    )
    for name, image, port, config, target in (
        (
            "prometheus",
            "prom/prometheus:v3.5.0",
            9090,
            ROOT / "docker/observability/prometheus.yml",
            "/etc/prometheus/prometheus.yml",
        ),
        ("alertmanager", "prom/alertmanager:v0.28.1", 9093, alert_config, "/etc/alertmanager/alertmanager.yml"),
    ):
        services[name] = {
            "image": image,
            "volumes": [str(config) + ":" + target + ":ro"],
            "ports": [f"127.0.0.1::{port}"],
            "logging": logging,
        }
    services["prometheus"]["volumes"] += [
        str(ROOT / "docker/observability/alerts.yml") + ":/etc/prometheus/alerts.yml:ro",
        str(managed / "discovery") + ":/etc/prometheus/discovery:ro",
    ]
    services["alertmanager"]["volumes"].append(str(webhook) + ":/run/secrets/alert_webhook_url:ro")
    services["node-exporter"] = {
        "image": "prom/node-exporter:v1.9.1",
        "command": ["--path.rootfs=/host"],
        "volumes": ["/:/host:ro,rslave"],
        "logging": logging,
    }
    configuration = {
        "name": project,
        "services": services,
        "volumes": {"test-pg": {}, "prod-redis-data": {}},
        "networks": {"default": {"name": network}},
    }
    compose_file = output / "compose.json"
    compose_file.write_text(json.dumps(configuration, indent=2))
    compose = ["docker", "compose", "-p", project, "-f", str(compose_file)]

    def host_tool(command):
        return run(
            "docker",
            "run",
            "--rm",
            "--user",
            "0",
            "--entrypoint",
            "python",
            "-v",
            str(managed) + ":/managed",
            "-v",
            str(ROOT / "deploy/observability.py") + ":/host_tool.py:ro",
            "-v",
            "/usr/bin/docker:/usr/bin/docker:ro",
            "-v",
            "/var/run/docker.sock:/var/run/docker.sock",
            IMAGE,
            "/host_tool.py",
            command,
            "--log-root",
            "/managed/logs",
            "--state-root",
            "/managed/discovery",
            "--project",
            project,
            "--network",
            network,
            "--apply",
        )

    def container(service, index=0):
        return run(*compose, "ps", "-q", service).split()[index]

    def url(service, port):
        return "http://" + run(*compose, "port", service, str(port)).strip()

    def refresh():
        host_tool("refresh")

    def notifications(alertname=None):
        messages = json.loads(fetch(url("receiver", 9095))[1])
        return [
            message
            for message in messages
            if alertname is None or any(alert["labels"].get("alertname") == alertname for alert in message["alerts"])
        ]

    def query(expression):
        from urllib.parse import urlencode

        return json.loads(fetch(url("prometheus", 9090) + "/api/v1/query?" + urlencode({"query": expression}))[1])[
            "data"
        ]["result"]

    summary = {}
    try:
        host_tool("prepare")
        run(*compose, "up", "-d", "postgresql", "redis", timeout=120)
        run(*compose, "run", "--rm", "backend-migrate", timeout=120)
        bootstrap = """import asyncio
from src.main import app
from rapidkit_core.database import async_engine
from sqlmodel import SQLModel
async def go():
    async with async_engine.begin() as connection:
        await connection.run_sync(SQLModel.metadata.create_all)
asyncio.run(go())
"""
        run(*compose, "run", "--rm", "--no-deps", "backend-migrate", "python", "-c", bootstrap, timeout=120)
        run(
            *compose,
            "up",
            "-d",
            "--scale",
            "backend-api=2",
            "backend-api",
            "celery-worker",
            "celery-beat",
            "observability",
            "receiver",
            "prometheus",
            "alertmanager",
            "node-exporter",
            timeout=120,
        )
        wait(lambda: fetch(url("backend-api", 8006) + "/health/ready")[0] == 200)
        refresh()
        wait(lambda: len(query('up{job="rapidkit-process",service="api"} == 1')) == 2)
        wait(lambda: len(query('up{job="rapidkit-process",service=~"worker|beat"} == 1')) == 2)
        wait(lambda: query('rapidkit_runtime_processes{service="api"} >= 2'))
        summary["direct_multi_replica_scrape"] = True
        api = container("backend-api")
        assert run("docker", "exec", api, "id", "-u").strip() == "999"
        sentinel = "synthetic-persist-" + uuid4().hex
        log_event = (
            "from rapidkit_core.log import setup_logging,set_custom_logfile,logger; "
            "setup_logging(); set_custom_logfile(enqueue=False); logger.info(" + repr(sentinel) + "); logger.complete()"
        )
        run("docker", "exec", api, "python", "-c", log_event)
        before = {
            key
            for key, value in json.loads((managed / "discovery/inventory.json").read_text())["instances"].items()
            if value["running"]
        }
        run(
            *compose,
            "up",
            "-d",
            "--force-recreate",
            "--scale",
            "backend-api=2",
            "--no-deps",
            "backend-api",
            timeout=120,
        )
        wait(lambda: fetch(url("backend-api", 8006) + "/health/ready")[0] == 200)
        refresh()
        after = json.loads((managed / "discovery/targets.json").read_text())
        current = {
            key
            for key, value in json.loads((managed / "discovery/inventory.json").read_text())["instances"].items()
            if value["running"]
        }
        assert before != current
        assert len([row for row in after if row["labels"]["service"] == "api"]) == 2
        api = container("backend-api")
        check_log = (
            "from pathlib import Path; assert any("
            + repr(sentinel)
            + " in p.read_text() for p in Path('/app/logs').glob('*.log'))"
        )
        run("docker", "exec", api, "python", "-c", check_log)
        for service in ("celery-worker", "celery-beat"):
            run(*compose, "up", "-d", "--force-recreate", "--no-deps", service, timeout=120)
        refresh()
        summary["mounted_logs_survive_recreation"] = True
        engine_logging = json.loads(run("docker", "inspect", "--format", "{{json .HostConfig.LogConfig}}", api))
        assert engine_logging["Type"] == "json-file" and engine_logging["Config"]["max-size"] == "20m"
        # Only a removed default-hostname instance is eligible; an aged live instance must remain.
        aging = """import json,os,time
from pathlib import Path
state=json.loads(Path('/managed/discovery/inventory.json').read_text())
for hostname,instance in state['instances'].items():
    if instance['service']=='backend-api':
        for path in Path('/managed/logs/api').glob('access.'+hostname+'.*.log'):
            os.utime(path,(time.time()-8*86400,)*2)
"""
        run(
            "docker",
            "run",
            "--rm",
            "--user",
            "0",
            "--entrypoint",
            "python",
            "-v",
            str(managed) + ":/managed",
            IMAGE,
            "-c",
            aging,
        )
        host_tool("cleanup")
        after_cleanup = """import json
from pathlib import Path
state=json.loads(Path('/managed/discovery/inventory.json').read_text())
for hostname,instance in state['instances'].items():
    if instance['service']=='backend-api':
        paths=list(Path('/managed/logs/api').glob('access.'+hostname+'.*.log'))
        assert bool(paths)==instance['running'], (hostname,instance['running'])
"""
        run(
            "docker",
            "run",
            "--rm",
            "--user",
            "0",
            "--entrypoint",
            "python",
            "-v",
            str(managed) + ":/managed",
            IMAGE,
            "-c",
            after_cleanup,
        )
        summary["removed_instance_cleanup_preserves_live_files"] = True
        # Exceed the real role budget, then show the API and independent drop counter still work.
        pressure = """from rapidkit_core.log import setup_logging,set_custom_logfile,logger
from rapidkit_core import runtime_state
setup_logging()
set_custom_logfile(enqueue=False)
for _ in range(350):
    logger.info('x'*4000)
logger.complete()
runtime_state.write_snapshot()
"""
        run("docker", "exec", api, "python", "-c", pressure)
        wait(lambda: query('rapidkit_file_log_dropped_total{service="api"} > 0'))
        assert fetch(url("backend-api", 8006) + "/health/ready")[0] == 200
        wait(
            lambda: query(
                'rapidkit_log_directory_bytes{service="api"} / rapidkit_log_budget_bytes{service="api"} > 0.95'
            )
        )
        business_status, business_body = fetch(url("backend-api", 8006) + "/api/v1/auth/keys/public")
        assert business_status == 200 and json.loads(business_body)["code"] == 0
        summary["budget_drop_preserves_api"] = True
        readonly = copy.deepcopy(services["backend-api"])
        readonly["container_name"] = project + "-readonly-api"
        for mount in readonly["volumes"]:
            mount["read_only"] = True
        services["backend-api-readonly"] = readonly
        compose_file.write_text(json.dumps(configuration, indent=2))
        run(*compose, "up", "-d", "--no-deps", "backend-api-readonly", timeout=120)
        wait(lambda: fetch(url("backend-api-readonly", 8006) + "/health/ready")[0] == 200)
        wait(lambda: 'rapidkit_log_blocked{service="api"} ' in fetch(url("backend-api-readonly", 8006) + "/metrics")[1])
        business_status, business_body = fetch(url("backend-api-readonly", 8006) + "/api/v1/auth/keys/public")
        assert business_status == 200 and json.loads(business_body)["code"] == 0
        summary["readonly_log_filesystem_preserves_api"] = True
        run(*compose, "stop", "backend-api-readonly", timeout=30)
        # Real local Alertmanager notification, repeat suppression, escalation, resolution.
        labels = {
            "alertname": "RapidKitExercise",
            "service": "synthetic",
            "component": "exercise",
            "instance": "exercise",
            "severity": "warning",
            "owner": "rapidkit-operations",
        }

        def post_alert(severity, resolved=False):
            now = datetime.now(UTC)
            payload = [
                {
                    "labels": {**labels, "severity": severity},
                    "annotations": {"runbook": "apps/website/src/backend/observability.md#exercise"},
                    "startsAt": (now - timedelta(seconds=5)).isoformat(),
                    "endsAt": (now - timedelta(seconds=1) if resolved else now + timedelta(minutes=5)).isoformat(),
                }
            ]
            fetch(url("alertmanager", 9093) + "/api/v2/alerts", payload)

        post_alert("warning")
        wait(lambda: notifications("RapidKitExercise"))
        post_alert("warning")
        time.sleep(5)
        assert len(notifications("RapidKitExercise")) == 1
        post_alert("warning", True)
        post_alert("critical")
        wait(
            lambda: any(
                any(
                    alert["labels"]["severity"] == "critical" and alert["status"] == "firing"
                    for alert in message["alerts"]
                )
                for message in notifications("RapidKitExercise")
            )
        )
        post_alert("critical", True)
        wait(lambda: any(message["status"] == "resolved" for message in notifications("RapidKitExercise")))
        summary["notification_dedup_escalation_resolution"] = True
        # The production Redis rule runs at its real one-minute for duration.
        run(*compose, "stop", "redis", timeout=30)
        wait(lambda: any(row["value"][1] == "0" for row in query('rapidkit_dependency_up{component="redis"}')))
        wait(
            lambda: any(message["status"] == "firing" for message in notifications("RapidKitDependencyDown")),
            seconds=130,
        )
        assert query('up{job="rapidkit-process",service="worker"} == 1')
        assert query('rapidkit_task_event_publish_failed_total{service="worker"} > 0')
        run(*compose, "start", "redis", timeout=30)
        wait(lambda: any(row["value"][1] == "1" for row in query('rapidkit_dependency_up{component="redis"}')))
        wait(lambda: any(message["status"] == "resolved" for message in notifications("RapidKitDependencyDown")))
        summary["redis_outage_independent_evidence_and_real_rule_recovery"] = True
        run(*compose, "stop", "postgresql", timeout=30)
        wait(lambda: query('rapidkit_dependency_up{component="postgresql"} == 0'))

        def database_notification(status):
            return any(
                alert["labels"].get("component") == "postgresql" and alert["status"] == status
                for message in notifications("RapidKitDependencyDown")
                for alert in message["alerts"]
            )

        wait(lambda: database_notification("firing"), seconds=130)
        run(*compose, "start", "postgresql", timeout=30)
        wait(lambda: query('rapidkit_dependency_up{component="postgresql"} == 1'))
        wait(lambda: database_notification("resolved"))
        wait(lambda: fetch(url("backend-api", 8006) + "/health/ready")[0] == 200)
        summary["postgresql_outage_real_rule_and_recovery"] = True
        assert query("rapidkit_task_retention_enabled == 0")
        wait(lambda: query('rapidkit_ops_sample_success{component="stream_trim"} == 1'))
        assert query("rapidkit_events_trim_last_run_timestamp_seconds > 0")
        assert query("rapidkit_events_length >= 0")
        assert query("rapidkit_events_memory_bytes >= 0")
        assert query("rapidkit_redis_used_memory_bytes > 0")
        summary["redis_capacity_and_stream_maintenance_exported"] = True
        pending_script = """
redis.call('DEL', KEYS[1])
redis.call('XGROUP', 'CREATE', KEYS[1], 'fastapi-consumers', '0', 'MKSTREAM')
local id = redis.call('XADD', KEYS[1], ARGV[1], 'event_type', 'worker.heartbeat', 'data', ARGV[2], 'timestamp', ARGV[3])
redis.call('XREADGROUP', 'GROUP', 'fastapi-consumers', 'paused-fixture', 'COUNT', 1, 'STREAMS', KEYS[1], '>')
return id
"""
        unread_script = """
redis.call('DEL', KEYS[1])
redis.call('XGROUP', 'CREATE', KEYS[1], 'fastapi-consumers', '0', 'MKSTREAM')
for i = 1, 1100 do
    redis.call('XADD', KEYS[1], '*', 'event_type', 'worker.heartbeat', 'data', ARGV[2], 'timestamp', ARGV[3])
end
return 1100
"""
        worker_hostname = run(
            "docker", "inspect", "--format", "{{.Config.Hostname}}", container("celery-worker")
        ).strip()
        for alert_name, seed in (
            ("RapidKitPendingGrowing", pending_script),
            ("RapidKitUnreadBacklog", unread_script),
        ):
            wait(lambda: query("rapidkit_events_pending == 0") and query("rapidkit_events_lag == 0"))
            before = len(notifications(alert_name))
            # Stop consumers to close server-side blocking reads before seeding unread events.
            run(*compose, "stop", "backend-api", timeout=60)
            redis_cli = (
                "docker",
                "exec",
                container("redis"),
                "redis-cli",
                "--no-auth-warning",
                "-a",
                environment["REDIS_ROOT_PASSWORD"],
                "-n",
                environment["REDIS_DATABASE"],
            )
            snapshot = {"before_seed": json.loads(run(*redis_cli, "--json", "XINFO", "GROUPS", "celery:events"))}
            # Each scenario resets this disposable stream; shutdown can leave in-flight messages pending.
            run(
                *redis_cli,
                "EVAL",
                seed,
                "1",
                "celery:events",
                str(int(time.time() * 1000) - 180000) + "-0",
                json.dumps({"hostname": worker_hostname}),
                datetime.now(UTC).isoformat(),
            )
            snapshot["seeded"] = json.loads(run(*redis_cli, "--json", "XINFO", "GROUPS", "celery:events"))
            (output / (alert_name + "-fixture.json")).write_text(json.dumps(snapshot, indent=2))
            if alert_name == "RapidKitPendingGrowing":
                wait(
                    lambda: (
                        query("rapidkit_events_pending == 1") and query("rapidkit_events_oldest_pending_seconds > 120")
                    )
                )
            else:
                wait(lambda: query("rapidkit_events_pending == 0") and query("rapidkit_events_lag > 1000"))
            wait(
                lambda: any(message["status"] == "firing" for message in notifications(alert_name)[before:]),
                seconds=130,
            )
            run(*compose, "start", "backend-api", timeout=60)
            refresh()
            wait(lambda: query("rapidkit_events_pending == 0") and query("rapidkit_events_lag == 0"))
            wait(lambda: any(message["status"] == "resolved" for message in notifications(alert_name)[before:]))
        summary["default_retention_disabled"] = True
        summary["fixed_pending_and_unread_backlog_notifications_and_recovery"] = True
        run(*compose, "stop", "observability", timeout=30)
        wait(lambda: query('up{job="rapidkit-ops"} == 0'))
        status, body = fetch(url("backend-api", 8006) + "/api/v1/auth/keys/public")
        assert status == 200 and json.loads(body)["code"] == 0
        run(*compose, "start", "observability", timeout=30)
        wait(lambda: query('up{job="rapidkit-ops"} == 1'))
        summary["sampler_loss_is_visible"] = True
        (output / "notifications.json").write_text(json.dumps(notifications(), indent=2))
        (output / "summary.json").write_text(json.dumps(summary, indent=2))
    finally:
        (output / "compose.log").write_text(run(*compose, "logs", "--no-color", timeout=30))
        run(*compose, "down", "--volumes", "--remove-orphans", timeout=120)
        # Restore access to synthetic evidence only; never touch production log ownership.
        cleanup_code = f"""import os
for directory, subdirs, files in os.walk('/managed'):
    os.chown(directory, {os.getuid()}, {os.getgid()})
    for filename in files:
        os.chown(os.path.join(directory, filename), {os.getuid()}, {os.getgid()})
"""
        run(
            "docker",
            "run",
            "--rm",
            "--user",
            "0",
            "--entrypoint",
            "python",
            "-v",
            str(managed) + ":/managed",
            IMAGE,
            "-c",
            cleanup_code,
        )
