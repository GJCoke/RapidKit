"""Internal HTTP metrics with bounded labels and per-container process aggregation."""

import os
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
from starlette.types import ASGIApp

from src.middlewares.logger import LoggerMiddleware
from src.runtime_metrics import render_runtime

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
        self.failures = Counter(
            "rapidkit_http_failures_total",
            "Failed HTTP requests by bounded category",
            ("method", "route", "error_kind"),
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

    def observe_request(self, method: str, route: str, outcome: str, kind: str | None, duration: float) -> None:
        method = method if method in _METHODS else "OTHER"
        self.requests.labels(method, route, outcome).inc()
        self.duration.labels(method, route).observe(duration)
        if kind is not None:
            self.failures.labels(method, route, kind).inc()

    def render(self) -> bytes:
        if self.multiproc_dir is None:
            return generate_latest(self.registry) + render_runtime()
        _clean_dead_gauges(self.multiproc_dir)
        registry = CollectorRegistry()
        multiprocess.MultiProcessCollector(registry, path=str(self.multiproc_dir))
        return generate_latest(registry) + render_runtime()

    def shutdown(self) -> None:
        if self.multiproc_dir is not None:
            multiprocess.mark_process_dead(os.getpid(), path=str(self.multiproc_dir))


class PrometheusMiddleware(LoggerMiddleware):
    """Compatibility entry for applications embedding the existing metrics middleware."""

    def __init__(self, app: ASGIApp, metrics: HTTPMetrics):
        super().__init__(app, metrics=metrics)


router = APIRouter()


@router.get("/metrics", dependencies=[Public], include_in_schema=False)
async def metrics(request: Request) -> Response:
    return Response(request.app.state.prometheus.render(), media_type=CONTENT_TYPE_LATEST)
