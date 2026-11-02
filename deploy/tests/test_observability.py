import importlib.util
import json
import os
import time
from pathlib import Path


def load():
    path = Path(__file__).resolve().parents[1] / "observability.py"
    spec = importlib.util.spec_from_file_location("host_observability", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_discovery_tracks_each_replica_and_retains_stopped_inventory(tmp_path, monkeypatch):
    host = load()
    host.prepare(tmp_path / "logs", tmp_path / "state", os.getuid(), os.getgid())
    containers = [
        dict(id="a" * 64, hostname="a" * 12, service="backend-api", running=True, address="172.30.0.10"),
        dict(id="b" * 64, hostname="b" * 12, service="backend-api", running=True, address="172.30.0.11"),
    ]
    monkeypatch.setattr(host, "inspect_containers", lambda project, network: containers)
    host.refresh(tmp_path / "state", "test", "test")
    targets = json.loads((tmp_path / "state/targets.json").read_text())
    assert {row["targets"][0] for row in targets} == {"172.30.0.10:8006", "172.30.0.11:8006"}
    containers.pop()
    host.refresh(tmp_path / "state", "test", "test")
    assert len(json.loads((tmp_path / "state/targets.json").read_text())) == 1
    assert json.loads((tmp_path / "state/inventory.json").read_text())["instances"]["b" * 12]["running"] is False


def test_cleanup_requires_known_stopped_host_and_fresh_inventory(tmp_path, monkeypatch):
    host = load()
    logs, state = tmp_path / "logs", tmp_path / "state"
    host.prepare(logs, state, os.getuid(), os.getgid())
    rows = [
        dict(id="a" * 64, hostname="a" * 12, service="backend-api", running=True, address="172.30.0.10"),
        dict(id="b" * 64, hostname="b" * 12, service="backend-api", running=False, address=""),
    ]
    monkeypatch.setattr(host, "inspect_containers", lambda *args: rows)
    host.refresh(state, "test", "test")
    for name in ("access." + "a" * 12 + ".1.log", "access." + "b" * 12 + ".1.log", "access.unknown.1.log"):
        path = logs / "api" / name
        path.write_text("evidence")
        os.utime(path, (time.time() - 8 * 86400,) * 2)
    outside = tmp_path / "outside"
    outside.write_text("preserve")
    (logs / "api" / ("error." + "b" * 12 + ".2.log")).symlink_to(outside)
    # A stopped container can still restart and must keep its files.
    assert host.cleanup(logs, state, "test", "test", apply=True) == 0
    # Deleted container IDs cannot be restarted between the check and unlink.
    rows.pop()
    assert host.cleanup(logs, state, "test", "test", apply=False) == 1
    assert host.cleanup(logs, state, "test", "test", apply=True) == 1
    assert (logs / "api" / ("access." + "a" * 12 + ".1.log")).exists()
    assert (logs / "api/access.unknown.1.log").exists() and outside.read_text() == "preserve"
