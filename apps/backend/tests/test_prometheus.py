"""Bounded route labels, business outcomes, live gauges and process aggregation."""

import asyncio
import os
import subprocess
import sys
from pathlib import Path
from uuid import uuid4

import pytest
from fastapi import FastAPI, Request
from httpx import ASGITransport, AsyncClient
from prometheus_client.parser import text_string_to_metric_families
from src.prometheus import HTTPMetrics, PrometheusMiddleware, router


def samples(body):
    return [sample for family in text_string_to_metric_families(body) for sample in family.samples]


def value(body, name, **labels):
    return sum(
        sample.value
        for sample in samples(body)
        if sample.name == name and all(sample.labels.get(k) == v for k, v in labels.items())
    )


def application():
    app = FastAPI()
    app.state.prometheus = HTTPMetrics()
    app.add_middleware(PrometheusMiddleware, metrics=app.state.prometheus)
    app.include_router(router)

    @app.get("/api/v1/users/{user_id}")
    async def user(user_id: str):
        return {"id": user_id}

    @app.get("/business-error")
    async def failure(request: Request):
        request.state.business_code = 14003
        return {"code": 14003}

    @app.get("/exception")
    async def exception():
        raise ValueError("broken")

    for path in ("/health/live", "/health/ready"):
        app.get(path)(lambda: {"status": "ok"})
    return app


@pytest.mark.asyncio
async def test_route_templates_do_not_leak_ids_and_internal_paths_are_excluded():
    app = application()
    ids = [str(uuid4()), str(uuid4())]
    async with AsyncClient(
        transport=ASGITransport(app=app, raise_app_exceptions=False), base_url="http://test"
    ) as client:
        for user_id in ids:
            assert (await client.get("/api/v1/users/" + user_id)).status_code == 200
        await client.get("/business-error")
        await client.get("/unmatched-" + ids[0])
        await client.get("/exception")
        first = (await client.get("/metrics")).text
        for path in ("/health/live", "/health/ready", "/metrics"):
            await client.get(path)
        second = (await client.get("/metrics")).text
    assert first == second
    assert all(user_id not in first for user_id in ids)
    assert "/health/" not in first and 'route="/metrics"' not in first
    assert value(first, "rapidkit_http_requests_total", route="/api/v1/users/{user_id}", outcome="success") == 2
    assert value(first, "rapidkit_http_requests_total", route="/business-error", outcome="error") == 1
    assert value(first, "rapidkit_http_requests_total", route="/exception", outcome="error") == 1
    assert value(first, "rapidkit_http_requests_total", route="unmatched", outcome="error") == 1
    assert value(first, "rapidkit_http_request_duration_seconds_count", route="/api/v1/users/{user_id}") == 2
    assert value(first, "rapidkit_http_requests_in_progress") == 0


@pytest.mark.asyncio
async def test_inflight_is_visible_and_cancellation_always_decrements():
    app = application()
    entered = asyncio.Event()

    @app.get("/blocked")
    async def blocked():
        entered.set()
        await asyncio.Event().wait()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        pending = asyncio.create_task(client.get("/blocked"))
        await asyncio.wait_for(entered.wait(), 1)
        assert value((await client.get("/metrics")).text, "rapidkit_http_requests_in_progress") == 1
        pending.cancel()
        with pytest.raises(asyncio.CancelledError):
            await pending
        body = (await client.get("/metrics")).text
    assert value(body, "rapidkit_http_requests_in_progress") == 0
    assert value(body, "rapidkit_http_requests_total", route="/blocked", outcome="error") == 1


def run_worker(directory, count, *, alive=False):
    code = """from src.prometheus import HTTPMetrics
from pathlib import Path
import os, time
metrics=HTTPMetrics(Path(os.environ['PROMETHEUS_MULTIPROC_DIR']))
for _ in range(COUNT):
 metrics.requests.labels('GET','/template','success').inc()
 metrics.duration.labels('GET','/template').observe(.1)
metrics.in_progress.inc()
print('ready',flush=True)
if ALIVE: time.sleep(60)
""".replace("COUNT", str(count)).replace("ALIVE", repr(alive))
    return subprocess.Popen(
        [sys.executable, "-c", code],
        env={**os.environ, "PROMETHEUS_MULTIPROC_DIR": str(directory)},
        stdout=subprocess.PIPE,
        text=True,
    )


def scrape_child(directory):
    code = (
        "from pathlib import Path; import os; from src.prometheus import HTTPMetrics; "
        "print(HTTPMetrics(Path(os.environ['PROMETHEUS_MULTIPROC_DIR'])).render().decode())"
    )
    return subprocess.check_output(
        [sys.executable, "-c", code], env={**os.environ, "PROMETHEUS_MULTIPROC_DIR": str(directory)}, text=True
    )


def test_multiprocess_registry_sums_workers_and_cleans_dead_gauges(tmp_path):
    first, second = run_worker(tmp_path, 3), run_worker(tmp_path, 4, alive=True)
    try:
        assert first.stdout.readline().strip() == second.stdout.readline().strip() == "ready"
        assert first.wait(timeout=10) == 0
        body = scrape_child(tmp_path)
        assert value(body, "rapidkit_http_requests_total") == 7
        assert value(body, "rapidkit_http_requests_in_progress") == 1
        assert body.count("# HELP rapidkit_http_requests_total ") == 1
        assert body.count("# TYPE rapidkit_http_requests_total ") == 1
        second.kill()
        second.wait(timeout=10)
        assert value(scrape_child(tmp_path), "rapidkit_http_requests_in_progress") == 0
    finally:
        for worker in (first, second):
            if worker.poll() is None:
                worker.kill()
            worker.wait(timeout=10)


def test_entrypoint_clears_once_for_api_and_unsets_worker_environment(tmp_path):
    root = Path(__file__).resolve().parents[3]
    entrypoint = root / "docker/backend/entrypoint.sh"
    directory = tmp_path / "metrics"
    directory.mkdir()
    (directory / "counter_stale.db").write_text("stale")
    (directory / "keep.txt").write_text("keep")
    executable = tmp_path / "uvicorn"
    executable.write_text(
        "#!"
        + sys.executable
        + "\nimport os\nfrom pathlib import Path\n"
        + "print(len(list(Path(os.environ['PROMETHEUS_MULTIPROC_DIR']).glob('*.db'))))\n"
    )
    executable.chmod(0o755)
    env = {
        **os.environ,
        "PROMETHEUS_MULTIPROC_DIR": str(directory),
        "PATH": str(tmp_path) + os.pathsep + os.environ["PATH"],
    }
    assert subprocess.check_output(["sh", str(entrypoint), "uvicorn"], env=env, text=True).strip() == "0"
    assert (directory / "keep.txt").exists()
    (directory / "counter_keep.db").write_text("keep")
    output = subprocess.check_output(
        ["sh", str(entrypoint), sys.executable, "-c", "import os; print(os.getenv('PROMETHEUS_MULTIPROC_DIR'))"],
        env=env,
        text=True,
    )
    assert output.strip() == "None"
    assert (directory / "counter_keep.db").exists()


@pytest.mark.asyncio
async def test_business_errors_and_early_rejections_are_counted_without_audit(client, monkeypatch):
    from rapidkit_core.config import settings

    monkeypatch.setattr(settings, "AUDIT_ENABLED", False)
    monkeypatch.setattr(settings, "RATE_LIMIT_ANONYMOUS", "1/minute")
    before = (await client.get("https://test/metrics")).text
    assert (await client.get("/auth/user/info")).json()["code"] == 14003
    assert (await client.get("/auth/keys/public")).json()["code"] == 1006
    assert (await client.get("/auth/keys/public", headers={"X-Request-ID": "invalid"})).json()["code"] != 0
    body = (await client.get("https://test/metrics")).text
    for route, expected in (("/api/v1/auth/user/info", 1), ("unmatched", 2)):
        assert (
            value(body, "rapidkit_http_requests_total", route=route, outcome="error")
            - value(before, "rapidkit_http_requests_total", route=route, outcome="error")
            == expected
        )


@pytest.mark.asyncio
async def test_arbitrary_http_methods_do_not_create_unbounded_labels():
    app = application()
    methods = ["CUSTOM" + uuid4().hex, "CUSTOM" + uuid4().hex]
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        for method in methods:
            await client.request(method, "/business-error")
        body = (await client.get("/metrics")).text
    assert all(method not in body for method in methods)
    assert value(body, "rapidkit_http_requests_total", method="OTHER", outcome="error") == 2
