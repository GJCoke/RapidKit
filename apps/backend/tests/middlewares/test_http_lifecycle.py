import asyncio
from types import SimpleNamespace

import pytest
from fastapi import FastAPI, Request
from httpx import ASGITransport, AsyncClient
from rapidkit_common.schemas.response import Response as Envelope
from rapidkit_core.log import logger
from rapidkit_core.nanoid import NanoIdPlugin, get_request_nanoid
from rapidkit_framework.exceptions import AppException
from rapidkit_framework.status_codes import StatusCode
from src.middlewares.context import ContextMiddleware
from src.middlewares.limiter import RateLimitMiddleware
from src.middlewares.logger import LoggerMiddleware
from src.middlewares.security import SecurityMiddleware
from src.prometheus import HTTPMetrics
from starlette.background import BackgroundTask
from starlette.exceptions import HTTPException
from starlette.responses import JSONResponse, StreamingResponse


def application():
    from src.main import setup_exception_handlers

    app = FastAPI()
    setup_exception_handlers(app)
    app.add_middleware(RateLimitMiddleware)
    app.add_middleware(ContextMiddleware, plugins=(NanoIdPlugin(),))
    app.add_middleware(SecurityMiddleware)

    async def check(rules):
        return 1 if rules[0][1] == "limited" else None

    async def rules(request):
        return [("default", "limited" if request.url.path == "/limited" else "normal", "1/minute")]

    app.state.limiter = SimpleNamespace(check=check)
    app.state.rate_limit_rules = rules
    app.state.prometheus = HTTPMetrics()

    @app.get("/ok")
    async def ok():
        return Envelope(data=True)

    @app.get("/business")
    async def business():
        return Envelope(code=12345)

    @app.get("/crash")
    async def crash():
        raise ValueError("private-exception")

    @app.get("/explicit-server")
    async def explicit_server():
        raise AppException(StatusCode.INTERNAL_SERVER_ERROR)

    @app.get("/http-server")
    async def http_server():
        raise HTTPException(500)

    @app.get("/background")
    async def background(request: Request):
        request.state.business_code = 0

        async def fail():
            raise ValueError("private-background")

        return JSONResponse({"code": 0}, background=BackgroundTask(fail))

    return app


@pytest.mark.asyncio
async def test_complete_request_evidence_and_shared_outcomes(monkeypatch):
    app = application()
    rows, metrics = [], []

    async def capture(**values):
        metrics.append(values)

    monkeypatch.setattr("src.middlewares.metrics._record_metrics", capture)
    handler = logger.add(lambda message: rows.append(message.record.copy()))
    wrapped = LoggerMiddleware(app, metrics=app.state.prometheus, record_redis=True)
    cases = [
        ("/ok", {}, "success", None),
        ("/business", {}, "error", "business"),
        ("/crash", {}, "error", "server"),
        ("/explicit-server", {}, "error", "server"),
        ("/http-server", {}, "error", "server"),
        ("/limited", {}, "error", "rate_limited"),
        ("/ok", {"X-Request-ID": "invalid"}, "error", "validation"),
        ("/ok", {"Content-Length": "999999999"}, "error", "security_reject"),
        ("/missing", {}, "error", "business"),
        ("/background", {}, "error", "server"),
    ]
    try:
        async with AsyncClient(
            transport=ASGITransport(app=wrapped, raise_app_exceptions=False), base_url="http://test"
        ) as client:
            for path, headers, outcome, kind in cases:
                response = await client.get(path, headers=headers)
                await asyncio.sleep(0)
                row = [record for record in rows if record["extra"].get("event") == "http.request.completed"][-1]
                fields = row["extra"]
                assert len(response.headers["X-Request-ID"]) == 21
                assert fields["outcome"] == outcome and fields["error_kind"] == kind
                assert fields["http_status"] == response.status_code == 200
                assert fields["response_complete"] is True
                assert fields["request_id"] == response.headers["X-Request-ID"]
                if path == "/background":
                    assert response.json()["code"] == fields["business_code"] == 0
                assert metrics[-1]["outcome"] == outcome
            completions = [r for r in rows if r["extra"].get("event") == "http.request.completed"]
            assert len(completions) == len(cases)
            assert 'outcome="error"' in app.state.prometheus.render().decode()
            assert all("private-" not in r["message"] for r in completions)
    finally:
        logger.remove(handler)


@pytest.mark.asyncio
async def test_streaming_failure_preserves_started_response_and_incomplete_body():
    app = FastAPI()

    @app.get("/stream")
    async def stream():
        async def body():
            yield b"first"
            raise ValueError("private-stream")

        return StreamingResponse(body())

    rows = []
    handler = logger.add(lambda message: rows.append(message.record.copy()))
    try:
        async with AsyncClient(
            transport=ASGITransport(app=LoggerMiddleware(app), raise_app_exceptions=False), base_url="http://test"
        ) as client:
            response = await client.get("/stream")
        assert response.status_code == 200
        complete = [r["extra"] for r in rows if r["extra"].get("event") == "http.request.completed"]
        assert len(complete) == 1
        assert complete[0]["response_complete"] is False
        assert complete[0]["processing_failed"] is True
    finally:
        logger.remove(handler)


@pytest.mark.asyncio
async def test_cancellation_records_once_and_restores_request_scope():
    entered = asyncio.Event()

    async def blocked(scope, receive, send):
        entered.set()
        await asyncio.Event().wait()

    rows = []
    handler = logger.add(lambda message: rows.append(message.record.copy()))
    try:
        async with AsyncClient(
            transport=ASGITransport(app=LoggerMiddleware(blocked)), base_url="http://test"
        ) as client:
            pending = asyncio.create_task(client.get("/blocked"))
            await entered.wait()
            pending.cancel()
            with pytest.raises(asyncio.CancelledError):
                await pending
        complete = [r["extra"] for r in rows if r["extra"].get("event") == "http.request.completed"]
        assert len(complete) == 1 and complete[0]["error_kind"] == "cancelled"
        assert get_request_nanoid() == "-"
    finally:
        logger.remove(handler)


@pytest.mark.asyncio
async def test_concurrent_authenticated_subjects_are_snapshotted_without_context_leaks():
    app = FastAPI()

    @app.get("/identity/{subject}")
    async def identity(subject: str, request: Request):
        request.state.auth = SimpleNamespace(subject=SimpleNamespace(id=subject), actor=SimpleNamespace(id="operator"))
        await asyncio.sleep(0)
        return {"code": 0}

    rows = []
    handler = logger.add(lambda message: rows.append(message.record.copy()))
    try:
        async with AsyncClient(transport=ASGITransport(app=LoggerMiddleware(app)), base_url="http://test") as client:
            await asyncio.gather(
                client.get("/identity/first", headers={"X-Request-ID": "A" * 21}),
                client.get("/identity/second", headers={"X-Request-ID": "B" * 21}),
            )
        complete = {
            r["extra"]["request_id"]: r["extra"] for r in rows if r["extra"].get("event") == "http.request.completed"
        }
        assert complete["A" * 21]["user_id"] == "first"
        assert complete["B" * 21]["user_id"] == "second"
        assert all(row["actor_id"] == "operator" for row in complete.values())
    finally:
        logger.remove(handler)


@pytest.mark.asyncio
async def test_response_send_failure_is_transport_error_and_is_reraised():
    async def app(scope, receive, send):
        await send({"type": "http.response.start", "status": 200, "headers": []})

    async def send(message):
        raise OSError("disconnected")

    async def receive():
        return {"type": "http.disconnect"}

    rows = []
    handler = logger.add(lambda message: rows.append(message.record.copy()))
    try:
        with pytest.raises(OSError):
            await LoggerMiddleware(app)(
                {"type": "http", "path": "/send", "method": "GET", "headers": []}, receive, send
            )
        complete = [r["extra"] for r in rows if r["extra"].get("event") == "http.request.completed"]
        assert len(complete) == 1 and complete[0]["error_kind"] == "transport"
        assert complete[0]["response_complete"] is False
    finally:
        logger.remove(handler)
