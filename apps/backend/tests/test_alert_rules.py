import subprocess
from pathlib import Path

import pytest


@pytest.mark.docker
@pytest.mark.parametrize("rule_tests", ["alerts.test.yml", "capacity-alerts.test.yml"])
def test_production_backlog_and_metrics_drop_rules(rule_tests):
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
            rule_tests,
        ],
        capture_output=True,
        text=True,
        timeout=30,
    )
    assert result.returncode == 0, result.stdout + result.stderr
