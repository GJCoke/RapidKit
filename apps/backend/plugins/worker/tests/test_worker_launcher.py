"""Each worker process boot has a distinct Celery control address."""

from plugin_worker.launcher import worker_command


def test_each_boot_has_a_unique_address_and_preserves_worker_arguments():
    first = worker_command("prod/default", ["-Q", "reports"])
    second = worker_command("prod/default", ["-Q", "reports"])
    assert first[:-1] == second[:-1]
    assert first[-1] != second[-1]
    assert first[:7] == ["celery", "-A", "src.queues.app", "worker", "-l", "info", "-Q"]
    assert first[-1].startswith("celery@prod-default-")
