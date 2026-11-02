"""Singleton global sampler. Deploy exactly once; process counters are scraped per container."""

import asyncio
import json
import os
import shutil
import stat
import threading
import time
from pathlib import Path

from plugin_worker.inventory import group_summaries
from prometheus_client import CollectorRegistry, start_http_server
from prometheus_client.core import GaugeMetricFamily
from rapidkit_core.config import settings
from rapidkit_core.database import AsyncSessionLocal
from rapidkit_core.log import component_failed, component_recovered, setup_logging
from rapidkit_core.timezone import timezone
from redis.asyncio import Redis
from redis.backoff import NoBackoff
from redis.retry import Retry
from sqlalchemy import text

from src.queues.event_stream import stream_status

SECTIONS = ("redis", "postgresql", "events", "audit", "capacity", "inventory", "logs", "retention")


class OperationalSampler:
    def __init__(self, redis, sessions, inventory: Path, log_root: Path, budget: int):
        self.redis, self.sessions, self.inventory, self.log_root, self.budget = (
            redis,
            sessions,
            inventory,
            log_root,
            budget,
        )
        self.values, self.status, self.timestamps = {}, {}, {}
        self.heartbeat = 0
        self.last_retention = float("-inf")
        self.lock = threading.Lock()

    async def _sample(self, component, function):
        try:
            async with asyncio.timeout(5):
                values = await function()
            with self.lock:
                self.values[component] = values
                self.timestamps[component] = time.time()
                self.status[component] = 1
            component_recovered("ops_" + component)
        except Exception as error:
            with self.lock:
                self.status[component] = 0
            component_failed("ops_" + component, error)

    async def _redis(self):
        return {"dependency_up": int(bool(await self.redis.ping()))}

    async def _postgresql(self):
        async with self.sessions() as session:
            connection = await session.connection()
            await connection.execute(text("SELECT 1"))
        return {"dependency_up": 1}

    async def _events(self):
        state = await stream_status(self.redis)
        if not state["groups_valid"] or state["lag"] is None:
            raise ValueError("Unknown observation group watermarks")
        return {
            "events_pending": state["pending"],
            "events_oldest_pending_seconds": state["oldest_pending_age_seconds"] or 0,
            "events_lag": state["lag"],
            "events_dead": state["dead"],
        }

    async def _audit(self):
        pending, processing = await self.redis.llen("audit:pending"), await self.redis.llen("audit:processing")
        return {"audit_pending": pending, "audit_processing": processing}

    async def _capacity(self):
        async with self.sessions() as session:
            summaries = await group_summaries(session, timezone.now())
        known = bool(summaries) and all(group.expected_replicas is not None for group in summaries)
        return {
            "worker_capacity_known": int(known),
            "worker_capacity_missing": sum(group.missing for group in summaries),
        }

    async def _inventory(self):
        value = json.loads(self.inventory.read_text())
        return {"inventory_updated_timestamp_seconds": float(value["updated_at"])}

    async def _logs(self):
        result = {}
        for role in ("api", "worker", "beat", "migrate"):
            directory = self.log_root / role
            used = 0
            for parent, dirs, files in os.walk(directory, followlinks=False):
                dirs[:] = [name for name in dirs if name != "verification" and not (Path(parent) / name).is_symlink()]
                for name in files:
                    metadata = (Path(parent) / name).stat(follow_symlinks=False)
                    if stat.S_ISREG(metadata.st_mode):
                        used += metadata.st_size
            usage = shutil.disk_usage(directory)
            result[role] = {
                "log_directory_bytes": used,
                "log_budget_bytes": self.budget,
                "log_filesystem_free_bytes": usage.free,
                "log_filesystem_size_bytes": usage.total,
            }
        return result

    async def _retention(self):
        if settings.TASK_RESULT_RETENTION_DAYS is None:
            return {"task_retention_enabled": 0}
        if time.monotonic() - self.last_retention < 3600:
            return self.values["retention"]
        from plugin_worker.retention import prune_results

        async with self.sessions() as session:
            count = await prune_results(session, self.redis, days=settings.TASK_RESULT_RETENTION_DAYS, apply=True)
            await session.commit()
        self.last_retention = time.monotonic()
        return {
            "task_retention_enabled": 1,
            "task_retention_last_deleted": count,
            "task_retention_last_run_timestamp_seconds": time.time(),
        }

    async def sample(self):
        self.heartbeat = time.time()
        await asyncio.gather(*(self._sample(name, getattr(self, "_" + name)) for name in SECTIONS))

    def collect(self):
        with self.lock:
            values, status, timestamps = dict(self.values), dict(self.status), dict(self.timestamps)
        yield GaugeMetricFamily(
            "rapidkit_ops_heartbeat_timestamp_seconds", "Global sampler loop heartbeat", value=self.heartbeat
        )
        for name, source in (("ops_sample_success", status), ("ops_sample_timestamp_seconds", timestamps)):
            family = GaugeMetricFamily("rapidkit_" + name, "Global sampling validity/freshness", labels=["component"])
            for section in SECTIONS:
                family.add_metric([section], source.get(section, 0))
            yield family
        dependency = GaugeMetricFamily("rapidkit_dependency_up", "Independent dependency probe", labels=["component"])
        for section in ("redis", "postgresql"):
            dependency.add_metric(
                [section], values.get(section, {}).get("dependency_up", 0) if status.get(section) else 0
            )
        yield dependency
        for section, data in values.items():
            if section in ("redis", "postgresql"):
                continue
            if section == "logs":
                for metric in next(iter(data.values()), {}):
                    family = GaugeMetricFamily("rapidkit_" + metric, "Log budget/filesystem state", labels=["service"])
                    for role, fields in data.items():
                        family.add_metric([role], fields[metric])
                    yield family
            else:
                for metric, value in data.items():
                    yield GaugeMetricFamily(
                        "rapidkit_" + metric, "Global operational state; gate on sampling validity", value=value
                    )


async def run():
    setup_logging(service="exporter")
    redis = Redis.from_url(
        str(settings.REDIS_URL),
        decode_responses=True,
        socket_connect_timeout=2,
        socket_timeout=2,
        retry=Retry(NoBackoff(), 0),
    )
    sampler = OperationalSampler(
        redis,
        AsyncSessionLocal,
        Path(os.getenv("OBSERVABILITY_INVENTORY", "/inventory/inventory.json")),
        Path(os.getenv("OBSERVABILITY_LOG_ROOT", "/logs")),
        settings.LOG_FILE_BUDGET_BYTES or 5 * 1024**3,
    )
    registry = CollectorRegistry()
    registry.register(sampler)
    start_http_server(9009, registry=registry)
    try:
        while True:
            await sampler.sample()
            await asyncio.sleep(10)
    finally:
        await redis.aclose()


if __name__ == "__main__":
    asyncio.run(run())
