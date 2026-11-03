"""The production gateway preserves a safe client ID even without an API response."""

import http.client
import json
import socket
import subprocess
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from uuid import uuid4

import pytest


def free_port():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


@pytest.mark.docker
def test_gateway_client_id_validation_and_no_response(tmp_path):
    root = Path(__file__).resolve().parents[3]
    output = root / "logs/verification"
    output.mkdir(parents=True, exist_ok=True)
    accepted, release = threading.Event(), threading.Event()
    observed = {}
    api_id = "a" * 21

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            observed[self.path] = self.headers.get_all("X-Request-ID")
            if self.path.endswith("/aborted"):
                accepted.set()
                release.wait(10)
                return
            self.send_response(200)
            self.send_header("X-Request-ID", api_id)
            self.send_header("Content-Length", "0")
            self.end_headers()

        def log_message(self, *_args):
            pass

    backend = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=backend.serve_forever, daemon=True)
    thread.start()
    port = free_port()
    config = (root / "docker/prod/nginx.conf").read_text()
    config = config.replace("listen 80;", f"listen 127.0.0.1:{port};")
    config = config.replace("backend-api:8006", f"127.0.0.1:{backend.server_port}")
    config = config.replace("http://minio:9000/", "http://127.0.0.1:9/")
    config = config.replace("${MAX_REQUEST_BODY_BYTES}", "1m")
    config = config.replace("${SECURITY_HSTS_ENABLED}", "false").replace("${SENTRY_CONNECT_SRC}", "")
    path = tmp_path / "nginx.conf"
    path.write_text(config)
    name = "rapidkit-client-id-" + uuid4().hex[:8]
    started = False

    def request(case, values):
        connection = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
        connection.putrequest("GET", "/api/" + case)
        for value in values:
            connection.putheader("X-Request-ID", value)
        connection.endheaders()
        if case == "aborted":
            assert accepted.wait(5)
            # HTTPConnection.close() closes the TCP transport without reading.
            connection.close()
            return None
        response = connection.getresponse()
        result = response.status, dict(response.getheaders())
        response.read()
        connection.close()
        return result

    try:
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
                f"{path}:/etc/nginx/nginx.conf:ro",
                "-v",
                f"{root / 'docker/prod/security-headers.conf'}:/etc/nginx/security-headers.conf:ro",
                "nginx:stable-alpine",
            ],
            check=True,
            capture_output=True,
            text=True,
        )
        started = True
        for _ in range(100):
            try:
                with socket.create_connection(("127.0.0.1", port), timeout=0.1):
                    break
            except OSError:
                time.sleep(0.05)
        cases = {
            "valid": ["c" * 21],
            "missing": [],
            "invalid": ["private-value"],
            "too-long": ["d" * 22],
            "duplicate": ["e" * 21, "f" * 21],
        }
        for case, values in cases.items():
            status, headers = request(case, values)
            assert status == 200 and headers["X-Request-ID"] == api_id
            assert len(headers["X-Edge-Request-ID"]) == 32
        request("aborted", ["g" * 21])
        backend.shutdown()
        backend.server_close()
        status, headers = request("unavailable", ["h" * 21])
        assert status == 502 and len(headers["X-Edge-Request-ID"]) == 32
        assert "X-Request-ID" not in headers
        rows = {}
        for _ in range(100):
            logs = subprocess.check_output(["docker", "logs", name], stderr=subprocess.STDOUT, text=True)
            rows = {
                row["path"]: row
                for line in logs.splitlines()
                if line.startswith('{"event"')
                for row in [json.loads(line)]
            }
            if "/api/unavailable" in rows and "/api/aborted" in rows:
                break
            time.sleep(0.05)
        (output / "gateway-client-id.log").write_text(logs)
        for case in cases:
            assert rows["/api/" + case]["client_request_id"] == ("c" * 21 if case == "valid" else "")
            assert rows["/api/" + case]["request_id"] == api_id
        for case, status, client_id in (("aborted", 499, "g" * 21), ("unavailable", 502, "h" * 21)):
            row = rows["/api/" + case]
            assert row["client_request_id"] == client_id
            assert row["request_id"] == "" and len(row["edge_request_id"]) == 32
            assert row["http_status"] == status
        assert observed["/api/valid"] == ["c" * 21]
        assert "private-value" not in json.dumps(list(rows.values()))
    finally:
        release.set()
        backend.shutdown()
        backend.server_close()
        thread.join(5)
        if started:
            subprocess.run(["docker", "stop", name], capture_output=True, timeout=15)
