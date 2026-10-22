"""Query credentials must never be copied into HTTP log messages."""

from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from rapidkit_core.config import settings
from rapidkit_core.log import logger
from src.middlewares.logger import LoggerMiddleware


async def test_reset_query_token_is_absent_from_normal_and_slow_logs(monkeypatch):
    app = FastAPI()
    app.add_middleware(LoggerMiddleware)
    app.get("/reset")(lambda: {"ok": True})
    monkeypatch.setattr(settings, "SLOW_REQUEST_THRESHOLD_MS", -1)
    messages = []
    sink = logger.add(
        lambda message: messages.append(message.record["message"]),
        filter=lambda record: record["name"] == "src.middlewares.logger",
    )
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            assert (await client.get("/reset?token=private-reset-credential")).status_code == 200
        assert any("/reset" in message for message in messages)
        assert all("private-reset-credential" not in message and "?token" not in message for message in messages)
    finally:
        logger.remove(sink)
