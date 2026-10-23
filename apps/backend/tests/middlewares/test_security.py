"""Security headers cover early rejections; bodies have a bounded streaming limit.

Author : Codex
Date   : 2026-10-23
"""

from typing import Annotated
from unittest.mock import AsyncMock

import pytest
from fastapi import Body, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from httpx import ASGITransport, AsyncClient
from rapidkit_core.config import settings
from src.middlewares.security import SecurityMiddleware

LIMIT = 10485760
HEADERS = {
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "strict-origin-when-cross-origin",
}


def application():
    # main initializes Socket.IO, which requires the test's running event loop.
    from src.main import setup_exception_handlers

    app = FastAPI()
    entered = []
    setup_exception_handlers(app)
    app.add_middleware(CORSMiddleware, allow_origins=["https://frontend.example"], allow_methods=["POST"])
    app.add_middleware(SecurityMiddleware)

    @app.post("/echo")
    async def echo(body: Annotated[bytes, Body(media_type="application/octet-stream")]):
        entered.append(len(body))
        return {"length": len(body)}

    @app.get("/failure")
    async def failure():
        raise ValueError("unexpected")

    return app, entered


@pytest.mark.parametrize("enabled,scheme,hsts", [(False, "https", False), (True, "http", False), (True, "https", True)])
async def test_security_headers_on_success_and_error(enabled, scheme, hsts, monkeypatch):
    monkeypatch.setattr(settings, "SECURITY_HSTS_ENABLED", enabled)
    app, _ = application()
    async with AsyncClient(
        transport=ASGITransport(app=app, raise_app_exceptions=False), base_url=f"{scheme}://test"
    ) as client:
        responses = [await client.get(path) for path in ("/docs", "/missing", "/failure")]
        responses.append(
            await client.options(
                "/echo", headers={"Origin": "https://frontend.example", "Access-Control-Request-Method": "POST"}
            )
        )
    for response in responses:
        for name, value in HEADERS.items():
            assert response.headers[name] == value
        assert "content-security-policy" not in response.headers
        assert response.headers.get("strict-transport-security") == ("max-age=31536000" if hsts else None)


@pytest.mark.parametrize("size,accepted", [(LIMIT, True), (LIMIT + 1, False)])
@pytest.mark.parametrize("language,message", [("zh-CN", "请求体过大"), ("en-US", "Request body is too large")])
async def test_body_limit_boundaries(size, accepted, language, message, monkeypatch):
    monkeypatch.setattr(settings, "MAX_REQUEST_BODY_BYTES", LIMIT)
    app, entered = application()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/echo",
            content=b"x" * size,
            headers={"Content-Type": "application/octet-stream", "Accept-Language": language},
        )
    assert response.status_code == 200
    if accepted:
        assert response.json() == {"length": LIMIT}
        assert entered == [LIMIT]
    else:
        assert response.json() == {"code": 1007, "message": message, "data": None}
        assert entered == []
    assert response.headers["X-Content-Type-Options"] == "nosniff"


@pytest.mark.parametrize("lengths", [["nope"], ["-1"], ["1.5"], ["+5"], ["5", "6"], ["5,6"]])
async def test_invalid_content_length_is_business_bad_request(lengths):
    app, entered = application()
    headers = [("Content-Length", length) for length in lengths]
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post("/echo", content=b"value", headers=headers)
    assert response.status_code == 200
    assert response.json()["code"] == 1005
    assert entered == []


@pytest.mark.parametrize("declared", [None, "1"])
async def test_chunked_and_understated_bodies_are_bounded(declared, monkeypatch):
    monkeypatch.setattr(settings, "MAX_REQUEST_BODY_BYTES", 8)
    app, entered = application()
    chunks = []

    async def body():
        for index in range(100):
            chunks.append(index)
            yield b"abcd"

    headers = {"Content-Type": "application/octet-stream", "Accept-Language": "en-US"}
    if declared is not None:
        headers["Content-Length"] = declared
    async with AsyncClient(
        transport=ASGITransport(app=app, raise_app_exceptions=False), base_url="http://test"
    ) as client:
        response = await client.post("/echo", content=body(), headers=headers)
    assert response.status_code == 200
    assert response.json() == {"code": 1007, "message": "Request body is too large", "data": None}
    assert entered == []
    assert chunks == [0, 1, 2]


async def test_stream_at_limit_is_accepted_without_content_length(monkeypatch):
    monkeypatch.setattr(settings, "MAX_REQUEST_BODY_BYTES", 8)
    app, entered = application()

    async def body():
        yield b"abcd"
        yield b"efgh"

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post("/echo", content=body(), headers={"Content-Type": "application/octet-stream"})
    assert response.json() == {"length": 8}
    assert entered == [8]


async def test_chunked_limit_precedes_audit_and_records_business_error(monkeypatch):
    from src.main import setup_middlewares
    from src.prometheus import HTTPMetrics, router

    monkeypatch.setattr(settings, "MAX_REQUEST_BODY_BYTES", 8)
    app, entered = application()
    app.user_middleware.clear()
    app.include_router(router)
    app.state.prometheus = HTTPMetrics()
    app.state.limiter = type("Limiter", (), {"check": AsyncMock(return_value=None)})()
    setup_middlewares(app)

    async def body():
        yield b"abcd"
        yield b"efghi"

    async with AsyncClient(
        transport=ASGITransport(app=app, raise_app_exceptions=False), base_url="http://test"
    ) as client:
        response = await client.post("/echo", content=body(), headers={"Content-Type": "application/octet-stream"})
        metrics = (await client.get("/metrics")).text
    assert response.json()["code"] == 1007
    assert response.headers["X-Frame-Options"] == "DENY"
    assert entered == []
    assert 'rapidkit_http_requests_total{method="POST",outcome="error",route="unmatched"} 1.0' in metrics
