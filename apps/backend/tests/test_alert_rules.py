import subprocess
from pathlib import Path

import pytest


@pytest.mark.docker
def test_production_backlog_and_metrics_drop_rules():
    directory = Path(__file__).resolve().parents[3] / "docker/observability"
    result = subprocess.run(
        [
            "docker",
            "run",
            "--rm",
            "--network",
            "none",
            "--entrypoint",
            "/bin/promtool",
            "-v",
            f"{directory}:/rules:ro",
            "-w",
            "/rules",
            "prom/prometheus:v3.5.0",
            "test",
            "rules",
            "alerts.test.yml",
        ],
        capture_output=True,
        text=True,
        timeout=30,
    )
    assert result.returncode == 0, result.stdout + result.stderr
