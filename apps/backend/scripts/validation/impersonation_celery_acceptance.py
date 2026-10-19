"""Opt-in acceptance using dedicated PostgreSQL15432/Redis16379 and real processes.

Run from apps/backend through the worktree Python environment. Creates no containers;
requires disposable services, never uses application defaults for service addresses.
"""

import argparse
import asyncio
import importlib
import json
import os
import subprocess
import time
from pathlib import Path
from typing import Any, cast
from uuid import UUID

import httpx
import redis
import socketio
from cryptography.hazmat.primitives.asymmetric.rsa import RSAPublicKey
from plugin_permission.models import Role
from plugin_schedule.models import IntervalSchedule, PeriodicTask
from plugin_schedule.schedule_types import Period, TaskType
from rapidkit_core.config import settings
from rapidkit_core.database import AsyncSessionLocal, get_async_engine
from rapidkit_framework.identity import IdentityMetadata, identity_scope
from rapidkit_security import encrypt_message, load_public_pem
from scripts.validation.impersonation_celery_probe import app, identity_probe
from sqlalchemy import text
from sqlmodel import SQLModel, select
from src.initdb import init_db

HERE = Path(__file__).resolve().parents[2]
LOGS = Path(os.environ.get("ACCEPTANCE_LOG_DIR", "/tmp/impersonation-celery-acceptance"))
RUNNER = os.environ.get("ACCEPTANCE_PYTHON", "/tmp/rapidkit-impersonation-python")


def isolated_services() -> None:
    assert os.environ.get("RAPIDKIT_CELERY_ACCEPTANCE") == "1", "Explicit disposable-service opt-in required"

    assert settings.POSTGRESQL_HOST == "127.0.0.1" and settings.POSTGRESQL_PORT == 15432
    assert settings.POSTGRESQL_DATABASE == "test"
    assert settings.REDIS_HOST == "127.0.0.1" and settings.REDIS_PORT == 16379
    assert not app.conf.task_always_eager


async def seed() -> None:
    importlib.import_module("src.main")
    async with get_async_engine().begin() as connection:
        await connection.run_sync(SQLModel.metadata.drop_all)
        await connection.run_sync(SQLModel.metadata.create_all)
    async with AsyncSessionLocal() as session:
        await init_db(session)
        role = (await session.exec(select(Role).where(Role.code == "GUEST"))).one()
        role.permission_codes = [*role.permission_codes, "task:trigger"]
        session.add(role)
        interval = IntervalSchedule.model_validate({"every": 3, "period": Period.SECONDS})
        session.add(interval)
        await session.flush()
        session.add(
            PeriodicTask.model_validate(
                {
                    "name": "acceptance-database-probe",
                    "task": "impersonation_acceptance_probe",
                    "task_type": TaskType.INTERVAL,
                    "schedule_id": interval.id,
                    "args": ["from-database-beat"],
                    "enabled": True,
                }
            )
        )
        await session.commit()
    await get_async_engine().dispose()


async def database_snapshot(session_id: str) -> dict:
    try:
        async with AsyncSessionLocal() as session:
            connection = await session.connection()
            record = (
                (
                    await connection.execute(
                        text("SELECT ended_at,end_reason FROM auth_impersonation_sessions WHERE id=:id"),
                        {"id": UUID(session_id)},
                    )
                )
                .mappings()
                .one()
            )
            audits = (
                (
                    await connection.execute(
                        text(
                            "SELECT action,count(*) AS count FROM system_audit_logs "
                            "WHERE impersonation_session_id=:id GROUP BY action"
                        ),
                        {"id": UUID(session_id)},
                    )
                )
                .mappings()
                .all()
            )
            tasks = (
                (await connection.execute(text("SELECT task_id,task_name,status,result FROM worker_task_results")))
                .mappings()
                .all()
            )
        return {"session": dict(record), "audits": [dict(row) for row in audits], "tasks": [dict(row) for row in tasks]}
    finally:
        await get_async_engine().dispose()


def wait_until(check, timeout=15, label="condition"):
    deadline = time.monotonic() + timeout
    while True:
        value = check()
        if value:
            return value
        assert time.monotonic() < deadline, f"Timed out: {label}"
        time.sleep(0.2)


def run() -> None:
    isolated_services()
    LOGS.mkdir(parents=True, exist_ok=True)
    children = []
    streams = []
    sockets = []
    evidence: dict[str, Any] = {
        "broker": "redis://127.0.0.1:16379/1",
        "eager": app.conf.task_always_eager,
        "scheduler": "src.queues.scheduler:AsyncDatabaseScheduler",
        "expiry_interval": 60.0,
    }
    data = redis.Redis(host="127.0.0.1", port=16379, password="test", db=0, decode_responses=True)
    broker = redis.Redis(host="127.0.0.1", port=16379, password="test", db=1, decode_responses=True)

    def start(name, args):
        stream = (LOGS / f"{name}.log").open("w")
        streams.append(stream)
        process = subprocess.Popen([RUNNER, *args], cwd=HERE, stdout=stream, stderr=subprocess.STDOUT)
        children.append(process)
        return process

    def envelope(response, expected=0):
        body = response.json()
        assert body["code"] == expected, (body["code"], body.get("message"))
        return body.get("data")

    try:
        data.flushdb()
        broker.flushdb()
        with (LOGS / "seed.log").open("w") as output:
            subprocess.run(
                [RUNNER, str(Path(__file__).resolve()), "--seed"],
                cwd=HERE,
                stdout=output,
                stderr=subprocess.STDOUT,
                check=True,
            )
        api = start(
            "api",
            [
                "-m",
                "uvicorn",
                "scripts.validation.impersonation_celery_api:app",
                "--host",
                "127.0.0.1",
                "--port",
                "18060",
            ],
        )

        def ready():
            assert api.poll() is None, "API exited"
            try:
                return httpx.get("http://127.0.0.1:18060/openapi.json", timeout=1).status_code == 200
            except httpx.HTTPError:
                return False

        wait_until(ready, label="API ready")
        with httpx.Client(base_url="http://127.0.0.1:18060/api/v1", timeout=10) as http:
            public = cast(RSAPublicKey, load_public_pem(envelope(http.get("/auth/keys/public"))))
            login = envelope(
                http.post("/auth/login", json={"username": "admin", "password": encrypt_message(public, "123456")})
            )
            admin = {"Authorization": "Bearer " + login["accessToken"]}
            users = envelope(http.get("/users", headers=admin))["records"]
            actor = next(user for user in users if user["username"] == "admin")
            subject = next(user for user in users if user["username"] == "guest")
            created = envelope(
                http.post(
                    "/auth/impersonations",
                    headers=admin,
                    json={"targetUserId": subject["id"], "reason": "Real Celery/Beat acceptance"},
                )
            )
            simulated = {"Authorization": "Bearer " + created["accessToken"]}
            expected = {
                "user_id": subject["id"],
                "actor_id": actor["id"],
                "impersonation_session_id": created["sessionId"],
            }
            tasks = []
            for label, headers, identity in [
                ("http-simulated", simulated, expected),
                ("http-ordinary", admin, {"user_id": actor["id"], "actor_id": actor["id"]}),
            ]:
                triggered = envelope(
                    http.post(
                        "/tasks/trigger", headers=headers, json={"taskName": identity_probe.name, "args": [label]}
                    )
                )
                tasks.append((triggered["taskId"], identity))
            with identity_scope(IdentityMetadata(**expected)):
                direct = identity_probe.apply_async(
                    args=("direct-simulated",), headers={"actor_id": "forged", "correlation_id": "acceptance"}
                )
                tasks.append((direct.id, expected))
            packets = [json.loads(packet) for packet in cast(list[str], broker.lrange("celery", 0, -1))]
            evidence["broker_headers"] = [
                {
                    key: packet["headers"].get(key)
                    for key in ("id", "task", "user_id", "actor_id", "impersonation_session_id", "correlation_id")
                }
                for packet in packets
            ]
            assert len(packets) == 3
            worker = start(
                "worker",
                [
                    "-m",
                    "celery",
                    "-A",
                    "scripts.validation.impersonation_celery_probe:app",
                    "worker",
                    "--pool=prefork",
                    "--concurrency=1",
                    "--hostname=impersonation-acceptance@%h",
                    "--without-gossip",
                    "--without-mingle",
                    "--loglevel=INFO",
                ],
            )
            outcomes = []
            for task_id, identity in tasks:
                result = app.AsyncResult(task_id)
                wait_until(result.ready, timeout=20, label="real Worker result")
                assert result.successful(), str(result.result)
                outcomes.append({"id": task_id, "expected": identity, "result": result.result})
            evidence["producer_worker"] = outcomes
            (LOGS / "evidence.json").write_text(json.dumps(evidence, indent=2, default=str))
            for outcome in outcomes:
                assert outcome["result"]["identity"] == outcome["expected"], (
                    "Identity missing across real broker/Worker"
                )
                assert outcome["result"]["request_task_id"] == outcome["id"], (
                    "Celery request ID lost inside custom Task"
                )
            print(
                "PASS: HTTP/direct producer → Redis broker → prefork Worker identity and request metadata", flush=True
            )
            for mode in ("failure", "retry", "success"):
                with identity_scope(IdentityMetadata(**expected) if mode != "success" else IdentityMetadata()):
                    result = identity_probe.apply_async(args=(f"after-{mode}",), kwargs={"mode": mode})
                wait_until(result.ready, timeout=20, label=f"Worker {mode}")
                if mode == "failure":
                    assert result.failed()
                else:
                    assert result.successful(), str(result.result)
                    assert result.result["identity"] == (expected if mode == "retry" else {})
                    if mode == "retry":
                        assert result.result["request_retries"] == 1
                evidence[mode] = {
                    "id": result.id,
                    "state": result.state,
                    "result": str(result.result) if mode == "failure" else result.result,
                }
            with identity_scope(IdentityMetadata(**expected)):
                revoked = identity_probe.apply_async(args=("after-revoked",), countdown=8)
            revoked.revoke(terminate=False)
            wait_until(revoked.ready, timeout=15, label="real broker task revocation")
            assert revoked.state == "REVOKED"
            evidence["revoked"] = {"id": revoked.id, "state": revoked.state}

            # Celery's revoke command writes REVOKED before an ETA request is discarded.
            # Wait for the real Worker signal, not just the result-backend state.
            def revoked_published():
                return any(
                    fields["event_type"] == "task.revoked" and json.loads(fields["data"]).get("task_id") == revoked.id
                    for _, fields in cast(list[tuple[str, dict]], data.xrange("celery:events"))
                )

            wait_until(revoked_published, timeout=15, label="actual task.revoked signal")
            for outcome in outcomes:
                domain = wait_until(
                    lambda: data.hget("acceptance:domain-events", outcome["id"]),
                    label="real stream consumer/domain event",
                )
                domain = json.loads(domain)
                assert domain["metadata"] == outcome["expected"] and domain["handler_identity"] == outcome["expected"]
            signal_events = []
            for _, fields in cast(list[tuple[str, dict]], data.xrange("celery:events")):
                payload = json.loads(fields["data"])
                if payload.get("task_id") in {
                    evidence[mode]["id"] for mode in ("failure", "retry", "success", "revoked")
                }:
                    signal_events.append(
                        {
                            "type": fields["event_type"],
                            "task_id": payload["task_id"],
                            "identity": {key: payload[key] for key in expected if key in payload},
                        }
                    )
            for mode, event_type in [
                ("failure", "task.failure"),
                ("revoked", "task.revoked"),
                ("retry", "task.retry"),
                ("retry", "task.success"),
                ("success", "task.success"),
            ]:
                matching = [
                    event
                    for event in signal_events
                    if event["task_id"] == evidence[mode]["id"] and event["type"] == event_type
                ]
                assert matching and all(
                    event["identity"] == ({} if mode == "success" else expected) for event in matching
                )
            evidence["signal_events"] = signal_events
            evidence["domain_events"] = {
                outcome["id"]: json.loads(cast(str, data.hget("acceptance:domain-events", outcome["id"])))
                for outcome in outcomes
            }
            print("PASS: failure/retry/no identity leak and Redis Stream → consumer → domain event", flush=True)
            connection = socketio.Client(reconnection=False)
            sockets.append(connection)
            connection.connect(
                "http://127.0.0.1:18060",
                auth={"access_token": created["accessToken"]},
                namespaces=["/", "/notifications"],
                transports=["websocket"],
            )
            beat = start(
                "beat",
                [
                    "-m",
                    "celery",
                    "-A",
                    "scripts.validation.impersonation_celery_probe:app",
                    "beat",
                    "-S",
                    "src.queues.scheduler:AsyncDatabaseScheduler",
                    "--loglevel=INFO",
                    "--pidfile=" + str(LOGS / "beat.pid"),
                ],
            )
            started = time.monotonic()
            last_progress = 0
            while True:
                assert worker.poll() is None and beat.poll() is None
                snapshot = asyncio.run(database_snapshot(created["sessionId"]))
                if snapshot["session"]["ended_at"] is not None:
                    break
                elapsed = time.monotonic() - started
                assert elapsed < 85, "Beat did not end expired session"
                if elapsed - last_progress >= 15:
                    print(f"Waiting for production60second Beat expiry tick: {int(elapsed)}s", flush=True)
                    last_progress = elapsed
                time.sleep(1)
            assert snapshot["session"]["end_reason"] == "expired"
            assert next(row["count"] for row in snapshot["audits"] if row["action"] == "impersonation.expire") == 1
            wait_until(lambda: not connection.namespaces, label="expired sockets closed")
            scheduled = [
                task
                for task in snapshot["tasks"]
                if task["task_name"] == identity_probe.name
                and isinstance(task["result"], dict)
                and task["result"].get("label") == "from-database-beat"
            ]
            assert scheduled and all(task["result"]["identity"] == {} for task in scheduled)
            repeated = app.send_task("expire_impersonation_sessions")
            wait_until(repeated.ready, label="idempotent expiry delivery")
            assert repeated.successful(), str(repeated.result)

            def completed_expiry():
                state = asyncio.run(database_snapshot(created["sessionId"]))
                complete = [
                    task
                    for task in state["tasks"]
                    if task["task_name"] == "expire_impersonation_sessions" and str(task["status"]).lower() == "success"
                ]
                return state if len(complete) >= 2 else None

            final = wait_until(completed_expiry, label="Beat and repeated expiry result persisted")
            assert next(row["count"] for row in final["audits"] if row["action"] == "impersonation.expire") == 1
            envelope(http.get("/auth/user/info", headers=simulated), 14017)
            evidence["beat"] = {
                "session": final["session"],
                "audits": final["audits"],
                "database_schedule_executions": len(scheduled),
                "expiry_tasks": [
                    task for task in final["tasks"] if task["task_name"] == "expire_impersonation_sessions"
                ],
                "socket_namespaces": list(connection.namespaces),
            }
            evidence["status"] = "passed"
            print(
                "PASS: DB scheduler + native60second expiry Beat → broker → Worker → DB/audit/socket; "
                "repeat delivery is idempotent",
                flush=True,
            )
    finally:
        evidence.setdefault("status", "failed")
        (LOGS / "evidence.json").write_text(json.dumps(evidence, indent=2, default=str))
        for connection in sockets:
            connection.disconnect()
        for child in reversed(children):
            child.terminate()
        for child in reversed(children):
            try:
                child.wait(timeout=15)
            except subprocess.TimeoutExpired:
                child.kill()
                child.wait()
        for stream in streams:
            stream.close()
        data.close()
        broker.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--seed", action="store_true")
    args = parser.parse_args()
    isolated_services()
    if args.seed:
        asyncio.run(seed())
    else:
        run()
