"""Regression tests for database schedule refreshes, using an in-memory broker."""

from datetime import UTC, datetime, timedelta
from queue import Empty
from types import SimpleNamespace

import pytest
from celery import Celery
from plugin_schedule.solar import Solar
from src.queues.scheduler import ScheduleEntry, Scheduler


@pytest.fixture
def scheduler_factory(monkeypatch):
    clock = SimpleNamespace(now=datetime(2026, 10, 8, 11, 26, 9, tzinfo=UTC))
    monkeypatch.setattr(
        "src.queues.scheduler.timezone",
        SimpleNamespace(now=lambda: clock.now.replace(tzinfo=None)),
    )
    app = Celery("scheduler-test", broker="memory://", backend="cache+memory://", set_as_current=False)
    app.conf.update(timezone="Asia/Shanghai", enable_utc=True, refresh_interval=60)
    app.now = lambda: clock.now
    schedulers = []

    def create(config):
        class DatabaseScheduler(Scheduler):
            def get_database_schedule(self):
                return {name: ScheduleEntry(name=name, app=app, **entry) for name, entry in config.items()}

        scheduler = DatabaseScheduler(app)
        schedulers.append(scheduler)
        return scheduler

    with app.connection_for_read() as connection, connection.SimpleQueue("celery") as queue:
        queue.clear()
        yield clock, app, create, queue
        queue.clear()
    for scheduler in schedulers:
        scheduler.close()
        scheduler.connection.close()
    app.close()


def drain_tasks(queue):
    tasks = []
    while True:
        try:
            message = queue.get(block=False)
        except Empty:
            return tasks
        tasks.append(message.headers["task"])
        message.ack()


def test_changing_sunrise_to_solar_noon_dispatches_today_among_frequent_tasks(scheduler_factory):
    clock, app, create, queue = scheduler_factory
    config = {
        "solar": {"task": "solar-test", "schedule": Solar("sunrise", 0, 0, app=app)},
        "frequent": {"task": "frequent-test", "schedule": 30.0},
    }
    scheduler = create(config)
    scheduler.tick()
    clock.now = datetime(2026, 10, 8, 11, 31, 1, tzinfo=UTC)
    config["solar"]["schedule"] = Solar("solar_noon", 0, 0, app=app)
    scheduler.tick()
    drain_tasks(queue)

    clock.now = datetime(2026, 10, 8, 11, 47, 33, tzinfo=UTC)
    for _ in range(5):
        scheduler.tick()
    assert drain_tasks(queue).count("solar-test") == 1
    # Refreshing unchanged configuration must not reset the dispatch timestamp.
    clock.now += timedelta(seconds=61)
    for _ in range(5):
        scheduler.tick()
    assert "solar-test" not in drain_tasks(queue)


def test_shortening_interval_reorders_pending_tasks(scheduler_factory):
    clock, _, create, queue = scheduler_factory
    config = {
        "edited": {"task": "edited-test", "schedule": 3600.0},
        "frequent": {"task": "frequent-test", "schedule": 30.0},
    }
    scheduler = create(config)
    scheduler.tick()
    clock.now += timedelta(seconds=61)
    config["edited"]["schedule"] = 15.0
    for _ in range(5):
        scheduler.tick()
    assert drain_tasks(queue).count("edited-test") == 1


def test_idle_scheduler_wakes_at_database_refresh_deadline(scheduler_factory):
    clock, _, create, queue = scheduler_factory
    config = {}
    scheduler = create(config)
    assert 0 < scheduler.tick() <= 60
    clock.now += timedelta(seconds=30)
    assert 0 < scheduler.tick() <= 30
    clock.now += timedelta(seconds=30)
    config["new"] = {"task": "new-test", "schedule": 1.0}
    scheduler.tick()
    clock.now += timedelta(seconds=1)
    scheduler.tick()
    assert drain_tasks(queue) == ["new-test"]
