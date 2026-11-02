"""Exercise the deployed ASGI boundary through a real Nginx process."""

import asyncio
import json
import os
import socket
import subprocess
import sys
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import Request, urlopen
from uuid import uuid4

import pytest
from rapidkit_security import generate_rsa_key_pair, serialize_key
from sqlalchemy.engine import make_url

from tests.testing.fixtures import pytest_settings


def free_port():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def fetch(port, path, *, payload=None, headers=None):
    data = json.dumps(payload).encode() if payload is not None else None
    request = Request(f"http://127.0.0.1:{port}{path}", data=data, headers=headers or {})
    try:
        response = urlopen(request, timeout=5)
    except HTTPError as error:
        response = error
    with response:
        return response.status, {key.lower(): value for key, value in response.headers.items()}, response.read()


@pytest.mark.docker
@pytest.mark.asyncio
async def test_real_uvicorn_nginx_privacy_ids_and_outcomes(init, tmp_path):
    root = Path(__file__).resolve().parents[3]
    output = root / "logs/verification"
    output.mkdir(exist_ok=True, parents=True)
    api_port, gateway_port = free_port(), free_port()
    pg = make_url(pytest_settings.SQL_DATABASE_URL)
    redis = urlsplit(pytest_settings.REDIS_DATABASE_URL)
    private_key, public_key = generate_rsa_key_pair()
    env = {
        **os.environ,
        "ENVIRONMENT": "PRODUCTION",
        "LOG_JSON": "true",
        "EXPOSE_API_DOCS": "false",
        "SENTRY_DSN": "",
        "POSTGRESQL_HOST": pg.host or "localhost",
        "POSTGRESQL_PORT": str(pg.port or 5432),
        "POSTGRESQL_USERNAME": pg.username or "",
        "POSTGRESQL_PASSWORD": pg.password or "",
        "POSTGRESQL_DATABASE": pg.database or "test",
        "REDIS_HOST": redis.hostname or "localhost",
        "REDIS_PORT": str(redis.port or 6379),
        "REDIS_ROOT_PASSWORD": redis.password or "",
        "REDIS_DATABASE": redis.path.strip("/") or "0",
        "MAX_REQUEST_BODY_BYTES": "256",
        "RAPIDKIT_BASE_PATH": str(output / "observability-a-live-runtime"),
        "ACCESS_TOKEN_KEY": "gateway-test-access-secret",
        "REFRESH_TOKEN_KEY": "gateway-test-refresh-secret",
        "IMPERSONATION_TOKEN_KEY": "gateway-test-impersonation-secret",
        "RSA_PRIVATE_KEY": serialize_key(private_key).decode(),
        "RSA_PUBLIC_KEY": serialize_key(public_key).decode(),
    }
    config = (root / "docker/prod/nginx.conf").read_text()
    config = config.replace("listen 80;", f"listen 127.0.0.1:{gateway_port};")
    config = config.replace("backend-api:8006", f"127.0.0.1:{api_port}")
    config = config.replace("http://minio:9000/", "http://127.0.0.1:9/")
    config = (
        config.replace("${MAX_REQUEST_BODY_BYTES}", "256")
        .replace("${SECURITY_HSTS_ENABLED}", "false")
        .replace("${SENTRY_CONNECT_SRC}", "")
    )
    nginx_config = tmp_path / "nginx.conf"
    nginx_config.write_text(config)
    name = "rapidkit-observability-a-" + uuid4().hex[:8]
    api_log = output / "observability-a-live-api.log"
    gateway_log = output / "observability-a-live-nginx.log"
    sentinel = "synthetic-" + uuid4().hex
    with api_log.open("w") as stream:
        api = subprocess.Popen(
            [sys.executable, "-m", "uvicorn", "src.main:asgi_app", "--host", "127.0.0.1", "--port", str(api_port)],
            cwd=root / "apps/backend",
            env=env,
            stdout=stream,
            stderr=subprocess.STDOUT,
        )
        started_container = False
        try:
            for _ in range(100):
                if api.poll() is not None:
                    pytest.fail("Live API exited; inspect logs/verification/observability-a-live-api.log")
                try:
                    if fetch(api_port, "/health/ready")[0] == 200:
                        break
                except URLError, TimeoutError:
                    pass
                await asyncio.sleep(0.1)
            else:
                pytest.fail("Live API was not ready")
            subprocess.run(
                [
                    "docker",
                    "run",
                    "--rm",
                    "-d",
                    "--name",
                    name,
                    "--network",
                    "host",
                    "-v",
                    f"{nginx_config}:/etc/nginx/nginx.conf:ro",
                    "-v",
                    f"{root / 'docker/prod/security-headers.conf'}:/etc/nginx/security-headers.conf:ro",
                    "nginx:stable-alpine",
                ],
                check=True,
                capture_output=True,
                text=True,
            )
            started_container = True
            for _ in range(50):
                try:
                    fetch(gateway_port, "/health/ready")
                    break
                except URLError:
                    await asyncio.sleep(0.1)
            for path in ("/api/v1/auth/invite/validate", "/api/v1/auth/password-reset/validate"):
                status, headers, body = fetch(
                    gateway_port, path, payload={"token": sentinel}, headers={"Content-Type": "application/json"}
                )
                assert status == 200 and json.loads(body)["data"] == {"valid": False}
                assert len(headers["x-request-id"]) == 21
            status, headers, body = fetch(gateway_port, "/api/v1/auth/user/info")
            assert status == 200 and json.loads(body)["code"] == 14003
            assert len(headers["x-request-id"]) == 21
            _, headers, body = fetch(gateway_port, "/api/v1/auth/keys/public", headers={"X-Request-ID": "invalid"})
            assert json.loads(body)["code"] == 1005 and len(headers["x-request-id"]) == 21
            _, rejection_headers, body = fetch(
                gateway_port,
                "/api/v1/auth/invite/validate",
                payload={"token": "x" * 300},
                headers={"Content-Type": "application/json"},
            )
            assert json.loads(body)["code"] == 1007
            assert len(rejection_headers["x-edge-request-id"]) == 32
            assert fetch(gateway_port, "/metrics")[0] == 404
            metrics = fetch(api_port, "/metrics")[2].decode()
            assert 'error_kind="authentication"' in metrics
            await asyncio.sleep(0.2)
            assert sentinel not in api_log.read_text()
            # Legacy query URIs remain a migration risk in Nginx error_log, separate from access_log.
            fetch(gateway_port, "/minio/nope?token=" + sentinel)
            logs = subprocess.check_output(["docker", "logs", name], stderr=subprocess.STDOUT, text=True)
            gateway_log.write_text(logs)
            rows = [json.loads(line) for line in logs.splitlines() if line.startswith('{"event"')]
            assert rows and all(sentinel not in json.dumps(row) for row in rows)
            assert any(row["reason_code"] == "body_too_large" for row in rows)
            assert any(len(row["edge_request_id"]) == 32 and len(row["request_id"]) == 21 for row in rows)
            (output / "observability-a-live-summary.json").write_text(
                json.dumps(
                    {
                        "post_validation": "passed",
                        "request_ids": "passed",
                        "business_metrics": "passed",
                        "gateway_rejection": "passed",
                        "safe_access_logs": "passed",
                        "legacy_query_error_log_exposure": sentinel in logs,
                    },
                    indent=2,
                )
            )
        finally:
            if started_container:
                subprocess.run(["docker", "stop", name], capture_output=True, timeout=15)
            api.terminate()
            try:
                api.wait(timeout=15)
            except subprocess.TimeoutExpired:
                api.kill()
                api.wait()
