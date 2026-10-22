"""Dependency probes and readiness during Uvicorn's existing shutdown flow."""

import asyncio
import signal
import threading
from collections.abc import Awaitable, Callable, Iterator
from contextlib import contextmanager
from types import FrameType
from typing import Any, cast

from fastapi import APIRouter, FastAPI, Request
from fastapi.responses import JSONResponse
from rapidkit_common.access import Public
from rapidkit_core.database import RedisManager, async_engine
from sqlalchemy import text

router = APIRouter(include_in_schema=False, dependencies=[Public])


def is_internal_path(path: str) -> bool:
    return path == "/health" or path.startswith("/health/") or path.rstrip("/") == "/metrics"


@router.get("/health/live")
async def live() -> dict[str, str]:
    return {"status": "ok"}


async def _postgresql_ready() -> bool:
    try:
        async with asyncio.timeout(2):
            async with async_engine.connect() as connection:
                await connection.execute(text("SELECT 1"))
        return True
    except Exception:
        return False


async def _redis_ready() -> bool:
    try:
        async with asyncio.timeout(2):
            return bool(await cast(Awaitable[bool], RedisManager.client().ping()))
    except Exception:
        return False


@router.get("/health/ready")
async def ready(request: Request) -> JSONResponse:
    if getattr(request.app.state, "shutting_down", False):
        postgresql, redis = False, False
    else:
        postgresql, redis = await asyncio.gather(_postgresql_ready(), _redis_ready())
    available = postgresql and redis
    return JSONResponse(
        status_code=200 if available else 503,
        content={
            "status": "ok" if available else "unavailable",
            "checks": {
                "postgresql": "ok" if postgresql else "unavailable",
                "redis": "ok" if redis else "unavailable",
            },
        },
    )


@contextmanager
def shutdown_readiness(app: FastAPI) -> Iterator[None]:
    app.state.shutting_down = False
    previous: dict[int, Callable[[int, FrameType | None], Any]] = {}

    def handle_exit(signum: int, frame: FrameType | None) -> None:
        app.state.shutting_down = True
        previous[signum](signum, frame)

    if threading.current_thread() is threading.main_thread():
        for signum in (signal.SIGTERM, signal.SIGINT):
            handler = signal.getsignal(signum)
            # Uvicorn has already installed its callable handler before lifespan.
            if callable(handler):
                previous[signum] = cast(Callable[[int, FrameType | None], Any], handler)
                signal.signal(signum, handle_exit)
    try:
        yield
    finally:
        for signum, handler in previous.items():
            if signal.getsignal(signum) is handle_exit:
                signal.signal(signum, handler)
