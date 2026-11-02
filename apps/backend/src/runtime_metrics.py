"""Per-container process aggregation without Redis or custom multiprocess collectors."""

import json
import math
import os
import socket
import time
from pathlib import Path

from prometheus_client import CollectorRegistry, generate_latest, start_http_server
from prometheus_client.core import CounterMetricFamily, GaugeMetricFamily
from rapidkit_core.config import settings
from rapidkit_core.runtime_state import COUNTERS, GAUGES, ROLES

_server = None


class RuntimeCollector:
    def __init__(self, directory: Path):
        self.directory = directory

    def collect(self):
        totals, gauges, live, ages, expected = {}, {}, {}, {}, {}
        errors = 0
        for path in self.directory.glob("*.json"):
            try:
                if path.is_symlink() or path.stat().st_size > 65536:
                    raise ValueError("unsafe snapshot")
                data = json.loads(path.read_text())
                pid, role = data["pid"], data["role"]
                if (
                    data["version"] != 1
                    or role not in ROLES
                    or path.name != f"{pid}.json"
                    or data["hostname"] != socket.gethostname()
                ):
                    raise ValueError("invalid process identity")
                try:
                    os.kill(pid, 0)
                    alive = True
                except ProcessLookupError:
                    alive = False
                for key, value in data["counters"].items():
                    if key in COUNTERS and isinstance(value, (int, float)) and math.isfinite(value) and value >= 0:
                        totals[role, key] = totals.get((role, key), 0) + value
                if alive:
                    live[role] = live.get(role, 0) + 1
                    ages[role] = max(ages.get(role, 0), max(0, time.time() - data["updated_at"]))
                    for key, value in data["gauges"].items():
                        if key in GAUGES and isinstance(value, (int, float)) and math.isfinite(value):
                            gauges[role, key] = gauges.get((role, key), 0) + value
                            if key.startswith("background_running:"):
                                expected[role, key] = expected.get((role, key), 0) + 1
            except OSError, ValueError, KeyError, TypeError, OverflowError:
                errors += 1
        for name in sorted({key.split(":")[0] for key in COUNTERS}):
            component_metric = name == "component_failures"
            family = CounterMetricFamily(
                "rapidkit_" + name,
                "Process-local cumulative operational count",
                labels=["service", "component"] if component_metric else ["service"],
            )
            for (role, item), value in totals.items():
                if item.split(":")[0] == name:
                    family.add_metric([role, *item.split(":")[1:]], value)
            yield family
        for name in ("audit_fallback", "log_blocked", "component_degraded", "background_running"):
            component_metric = name in ("component_degraded", "background_running")
            family = GaugeMetricFamily(
                "rapidkit_" + name,
                "Current live-process operational state",
                labels=["service", "component"] if component_metric else ["service"],
            )
            for (role, key), value in gauges.items():
                if key.split(":")[0] == name:
                    family.add_metric([role, *key.split(":")[1:]], value)
            yield family
        family = GaugeMetricFamily(
            "rapidkit_background_expected",
            "Live processes owning background component",
            labels=["service", "component"],
        )
        for (role, key), value in expected.items():
            family.add_metric([role, key.split(":")[1]], value)
        yield family
        if not live:
            role = os.getenv("RAPIDKIT_SERVICE_ROLE", "api")
            live[role], ages[role] = 0, float("inf")
        for name in ("runtime_processes", "runtime_snapshot_age_seconds", "runtime_state_fresh"):
            family = GaugeMetricFamily("rapidkit_" + name, "Runtime snapshot liveness", labels=["service"])
            for role in live:
                family.add_metric(
                    [role],
                    live[role]
                    if name == "runtime_processes"
                    else ages[role]
                    if name == "runtime_snapshot_age_seconds"
                    else float(ages[role] < 20),
                )
            yield family
        yield GaugeMetricFamily(
            "rapidkit_runtime_snapshot_errors", "Unreadable or invalid process snapshots", value=errors
        )


def render_runtime() -> bytes:
    if settings.RUNTIME_STATE_DIR is None:
        return b""
    registry = CollectorRegistry()
    registry.register(RuntimeCollector(settings.RUNTIME_STATE_DIR))
    return generate_latest(registry)


def start_process_exporter() -> None:
    global _server
    if settings.RUNTIME_STATE_DIR is not None and _server is None:
        registry = CollectorRegistry()
        registry.register(RuntimeCollector(settings.RUNTIME_STATE_DIR))
        _server = start_http_server(9008, registry=registry)
