import os
import subprocess
from pathlib import Path


def test_ingestion_origin_accepts_only_one_safe_origin():
    script = Path(__file__).resolve().parents[2] / "docker/frontend/15-observability-origin.sh"
    for origin in ("", "https://o123.ingest.sentry.io", "http://127.0.0.1:19000"):
        result = subprocess.run(
            ["sh", str(script)],
            env={"PATH": os.environ.get("PATH", "/usr/bin:/bin"), "SENTRY_CONNECT_SRC": origin},
            capture_output=True,
        )
        assert result.returncode == 0
    for origin in (
        "https://safe.test; script-src *",
        "https://safe.test\nscript-src *",
        "https://user:password@safe.test",
        "https://safe.test/path",
    ):
        result = subprocess.run(
            ["sh", str(script)],
            env={"PATH": os.environ.get("PATH", "/usr/bin:/bin"), "SENTRY_CONNECT_SRC": origin},
            capture_output=True,
        )
        assert result.returncode != 0
