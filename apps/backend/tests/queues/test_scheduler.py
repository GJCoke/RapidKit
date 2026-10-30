"""Regression tests for database schedule refreshes, using an in-memory broker."""

import asyncio
import time
from datetime import UTC, datetime, timedelta
from queue import Empty
from threading import Thread
from types import SimpleNamespace
from uuid import uuid4
from zoneinfo import ZoneInfo

import pytest
from celery import Celery
from plugin_schedule.solar import Solar
from rapidkit_core.config import settings
from rapidkit_core.leader_election import LeaderElection
from redis import Redis
from src.queues.scheduler import AsyncDatabaseScheduler, ScheduleEntry, Scheduler


def test_real_threaded_cron_loader_binds_application_and_refresh_preserves_state():
    from celery import current_app
    from plugin_schedule.models import CrontabSchedule
    from plugin_schedule.schedule_types import TaskType

    zone = ZoneInfo("Asia/Shanghai")
    clock = SimpleNamespace(now=datetime(2026, 10, 28, 18, tzinfo=zone))
    app = Celery("threaded-cron-test", broker="memory://", set_as_current=False)
    app.conf.update(timezone="Asia/Shanghai", enable_utc=True, refresh_interval=60)
    app.now = lambda: clock.now
    cron = CrontabSchedule(minute="0", hour="8")
    task = SimpleNamespace(
        name="daily",
        task="noop",
        task_type=TaskType.CRONTAB,
        schedule_id=cron.id,
        args=[],
        kwargs={},
        options={},
    )

    class FakeSession:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            pass

        async def exec(self, query):
            return SimpleNamespace(all=lambda: [task], first=lambda: cron)

    loader = AsyncDatabaseScheduler.__new__(AsyncDatabaseScheduler)
    loader.app = app
    loader.AsyncSessionLocal = FakeSession
    loaded, errors = {}, []

    def load():
        default = current_app._get_current_object()
        original_now = default.now
        try:
            default.now = lambda: clock.now.astimezone(UTC)
            loaded.update(asyncio.run(loader.get_database_schedule()))
        except BaseException as exc:
            errors.append(exc)
        finally:
            default.now = original_now

    thread = Thread(target=load)
    thread.start()
    thread.join()
    assert not errors
    assert loaded["daily"].app is app
    scheduler = Scheduler(app, lazy=True)
    scheduler.merge_inplace(loaded)
    entry = scheduler.schedule["daily"]
    assert entry.last_run_at == clock.now
    assert str(entry.last_run_at.tzinfo) == "Asia/Shanghai"
    clock.now = datetime(2026, 10, 29, 8, tzinfo=zone)
    assert entry.is_due().is_due
    scheduler.schedule["daily"] = next(entry)
    scheduler.merge_inplace(loaded)
    refreshed = scheduler.schedule["daily"]
    assert refreshed.last_run_at == clock.now
    assert refreshed.total_run_count == 1
    assert not refreshed.is_due().is_due
    clock.now = datetime(2026, 10, 30, 8, tzinfo=zone)
    assert refreshed.is_due().is_due
    app.close()


def test_cron_entry_normalizes_existing_utc_baseline():
    from celery.schedules import crontab

    app = Celery("restored-cron-test", broker="memory://", set_as_current=False)
    app.conf.update(timezone="Asia/Shanghai", enable_utc=True)
    entry = ScheduleEntry(
        name="daily",
        task="noop",
        app=app,
        schedule=crontab(hour=8, minute=0),
        last_run_at=datetime(2026, 10, 28, 10, tzinfo=UTC),
        total_run_count=7,
    )
    assert entry.last_run_at.isoformat() == "2026-10-28T18:00:00+08:00"
    assert entry.total_run_count == 7
    app.close()


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


@pytest.fixture
def elected_schedulers(monkeypatch):
    key = f"test:beat-leader:{uuid4()}"
    monkeypatch.setattr(settings, "REDIS_DATABASE", 15)
    redis = Redis.from_url(str(settings.REDIS_URL))
    clock = SimpleNamespace(now=datetime(2026, 10, 23, tzinfo=UTC))
    monkeypatch.setattr("src.queues.scheduler.timezone", SimpleNamespace(now=lambda: clock.now.replace(tzinfo=None)))
    app = Celery("election-test", broker="memory://", backend="cache+memory://", set_as_current=False)
    app.conf.update(database_url=str(settings.ASYNC_DATABASE_POSTGRESQL_URL), refresh_interval=60)
    app.now = lambda: clock.now
    instances = []
    reads = []

    def election(client, name, *, ttl, renew_interval):
        assert name == "leader:celery-beat" and ttl == 15 and renew_interval == 5.0
        return LeaderElection(client, key, ttl=1, renew_interval=0.05)

    monkeypatch.setattr("src.queues.scheduler.LeaderElection", election, raising=False)

    def create(*, interval=1, lazy=False):
        class TestScheduler(AsyncDatabaseScheduler):
            async def get_database_schedule(self):
                reads.append(self)
                return {
                    "one": ScheduleEntry(
                        name="one",
                        app=app,
                        task="elected-test",
                        schedule=interval,
                        last_run_at=clock.now - timedelta(seconds=2),
                    )
                }

        scheduler = TestScheduler(app, lazy=lazy)
        instances.append(scheduler)
        return scheduler

    with app.connection_for_read() as connection, connection.SimpleQueue("celery") as queue:
        queue.clear()
        try:
            yield SimpleNamespace(create=create, redis=redis, key=key, clock=clock, queue=queue, reads=reads)
        finally:
            for scheduler in instances:
                scheduler.close()
                scheduler.connection.close()
            queue.clear()
            redis.delete(key)
            redis.close()
            app.close()


def wait_until(predicate, timeout=3):
    deadline = time.monotonic() + timeout
    while not predicate():
        assert time.monotonic() < deadline, "condition did not become true"
        time.sleep(0.01)


def test_two_schedulers_only_leader_publishes(elected_schedulers):
    env = elected_schedulers
    first, second = env.create(), env.create()
    published = []

    def tick():
        first.tick()
        second.tick()
        published.extend(drain_tasks(env.queue))
        return bool(published)

    wait_until(tick)
    assert published == ["elected-test"]
    standby = second if first._leader.is_leader else first
    assert standby not in env.reads


def test_standby_takes_over_after_leader_loss(elected_schedulers):
    env = elected_schedulers
    first, second = env.create(), env.create()
    wait_until(lambda: first._leader.is_leader or second._leader.is_leader)
    primary, standby = (first, second) if first._leader.is_leader else (second, first)
    primary.tick()
    assert drain_tasks(env.queue) == ["elected-test"]

    # Simulate a process disappearing without releasing the lease.
    async def suspend_election():
        primary._leader._task.cancel()
        try:
            await primary._leader._task
        except asyncio.CancelledError:
            pass
        primary._leader._task = None

    asyncio.run_coroutine_threadsafe(suspend_election(), primary._loop).result()
    wait_until(lambda: standby._leader.is_leader)
    env.clock.now += timedelta(seconds=2)
    standby.tick()
    assert drain_tasks(env.queue) == ["elected-test"]
    assert standby in env.reads


def test_lock_loss_prevents_next_publish(elected_schedulers):
    env = elected_schedulers
    scheduler = env.create()
    wait_until(lambda: scheduler._leader.is_leader)
    env.redis.set(env.key, "other-holder", ex=5)
    wait_until(lambda: not scheduler._leader.is_leader)
    assert scheduler.tick() <= 5
    assert drain_tasks(env.queue) == []


def test_election_renews_while_beat_sleeps(elected_schedulers):
    env = elected_schedulers
    first = env.create(interval=86400)
    wait_until(lambda: first._leader.is_leader)
    assert first.tick() > 1
    time.sleep(2.2)
    second = env.create(interval=86400)
    assert second.tick() <= 5
    assert first._leader.is_leader and not second._leader.is_leader
    assert env.redis.pttl(env.key) > 0
    assert drain_tasks(env.queue) == []


def test_close_disposes_resources_and_stops_thread(elected_schedulers):
    scheduler = elected_schedulers.create()
    wait_until(lambda: scheduler._leader.is_leader)
    thread = scheduler._thread
    original_pool = scheduler._engine.pool
    scheduler.close()
    assert scheduler._engine.pool is not original_pool
    assert not thread.is_alive()
    assert scheduler._loop.is_closed()
    assert not elected_schedulers.redis.exists(elected_schedulers.key)


def test_lazy_inspection_does_not_start_election(elected_schedulers):
    scheduler = elected_schedulers.create(lazy=True)
    assert getattr(scheduler, "_thread", None) is None
    assert not elected_schedulers.redis.exists(elected_schedulers.key)
