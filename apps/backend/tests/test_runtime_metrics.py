import json
import os
import socket
import time

from prometheus_client import CollectorRegistry, generate_latest


def test_runtime_collector_sums_counters_but_excludes_dead_process_gauges(tmp_path):
    from src.runtime_metrics import RuntimeCollector

    for pid, count, fallback in [(os.getpid(), 2, 3), (999999999, 7, 100)]:
        (tmp_path / f"{pid}.json").write_text(
            json.dumps(
                {
                    "version": 1,
                    "role": "api",
                    "pid": pid,
                    "hostname": socket.gethostname(),
                    "updated_at": time.time(),
                    "counters": {"task_event_publish_failed": count, "private-task": 1000},
                    "gauges": {"audit_fallback": fallback, "background_running:audit_delivery": 1},
                }
            )
        )
    registry = CollectorRegistry()
    registry.register(RuntimeCollector(tmp_path))
    body = generate_latest(registry).decode()
    assert 'rapidkit_task_event_publish_failed_total{service="api"} 9.0' in body
    assert 'rapidkit_audit_fallback{service="api"} 3.0' in body
    assert 'rapidkit_background_running{component="audit_delivery",service="api"} 1.0' in body
    assert "private-task" not in body and "pid=" not in body and "hostname=" not in body
    assert body.count("# TYPE rapidkit_component_failures_total counter") == 1


def test_runtime_collector_reports_corruption_and_stale_state(tmp_path):
    from src.runtime_metrics import RuntimeCollector

    (tmp_path / f"{os.getpid()}.json").write_text(
        json.dumps(
            {
                "version": 1,
                "role": "worker",
                "pid": os.getpid(),
                "hostname": socket.gethostname(),
                "updated_at": time.time() - 100,
                "counters": {},
                "gauges": {},
            }
        )
    )
    (tmp_path / "2.json").write_text("private-invalid-json")
    registry = CollectorRegistry()
    registry.register(RuntimeCollector(tmp_path))
    body = generate_latest(registry).decode()
    assert "rapidkit_runtime_snapshot_errors 1.0" in body
    assert 'rapidkit_runtime_state_fresh{service="worker"} 0.0' in body
