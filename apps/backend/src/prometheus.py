"""Internal HTTP metrics with bounded labels and per-container process aggregation."""

import os
import time
from pathlib import Path

from fastapi import APIRouter, Request
from prometheus_client import (
    CONTENT_TYPE_LATEST,
    CollectorRegistry,
    Counter,
    Gauge,
    Histogram,
    generate_latest,
    multiprocess,
)
from rapidkit_common.access import Public
from starlette.responses import Response
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from src.health import is_internal_path

_METHODS = frozenset({"GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "TRACE", "CONNECT"})


def _clean_dead_gauges(directory: Path) -> None:
    for path in directory.glob("gauge_live*.db"):
        try:
            pid = int(path.stem.rsplit("_", 1)[1])
            if pid > 0:
                os.kill(pid, 0)
        except ProcessLookupError:
            multiprocess.mark_process_dead(pid, path=str(directory))
        except ValueError, PermissionError:
            continue


class HTTPMetrics:
    def __init__(self, multiproc_dir: Path | None = None):
        self.multiproc_dir = multiproc_dir
        self.registry = CollectorRegistry()
        self.requests = Counter(
            "rapidkit_http_requests_total",
            "Completed HTTP requests",
            ("method", "route", "outcome"),
            registry=self.registry,
        )
        self.duration = Histogram(
            "rapidkit_http_request_duration_seconds",
            "HTTP request duration",
            ("method", "route"),
            registry=self.registry,
        )
        self.in_progress = Gauge(
            "rapidkit_http_requests_in_progress",
            "HTTP requests currently in progress",
            multiprocess_mode="livesum",
            registry=self.registry,
        )

    def render(self) -> bytes:
        if self.multiproc_dir is None:
            return generate_latest(self.registry)
        _clean_dead_gauges(self.multiproc_dir)
        registry = CollectorRegistry()
        multiprocess.MultiProcessCollector(registry, path=str(self.multiproc_dir))
        return generate_latest(registry)

    def shutdown(self) -> None:
        if self.multiproc_dir is not None:
            multiprocess.mark_process_dead(os.getpid(), path=str(self.multiproc_dir))


class PrometheusMiddleware:
    def __init__(self, app: ASGIApp, metrics: HTTPMetrics):
        self.app, self.metrics = app, metrics

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or is_internal_path(scope["path"]):
            await self.app(scope, receive, send)
            return
        method = scope["method"] if scope["method"] in _METHODS else "OTHER"
        status, failed = 500, False
        started = time.perf_counter()
        self.metrics.in_progress.inc()

        async def observe(message: Message) -> None:
            nonlocal status
            if message["type"] == "http.response.start":
                status = message["status"]
            await send(message)

        try:
            await self.app(scope, receive, observe)
        except BaseException:
            failed = True
            raise
        finally:
            route = getattr(scope.get("route"), "path", "unmatched")
            code = scope.get("state", {}).get("business_code")
            outcome = "error" if failed or status >= 400 or code not in (None, 0) else "success"
            self.metrics.in_progress.dec()
            self.metrics.requests.labels(method, route, outcome).inc()
            self.metrics.duration.labels(method, route).observe(time.perf_counter() - started)


router = APIRouter()


@router.get("/metrics", dependencies=[Public], include_in_schema=False)
async def metrics(request: Request) -> Response:
    return Response(request.app.state.prometheus.render(), media_type=CONTENT_TYPE_LATEST)
