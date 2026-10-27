"""Read-only probes run inside the example application's existing backend image."""

import asyncio
import json
import pathlib
import socket
import sys
from importlib.util import find_spec


def main():
    action = sys.argv[1]
    if action == "config":
        from rapidkit_core.config import settings
        from src.main import app

        if not settings.ENVIRONMENT.is_deployed or app.state.plugin_load_result.errors:
            raise ValueError("Production environment/plugins invalid")
        from rapidkit_core.database import async_engine
        from redis.asyncio import Redis
        from sqlalchemy import text

        async def probe():
            async with async_engine.connect() as connection:
                await connection.execute(text("SELECT 1"))
                inventory = bool(
                    await connection.scalar(text("SELECT to_regclass('public.worker_groups') IS NOT NULL"))
                )
            async with Redis.from_url(str(settings.REDIS_URL)) as redis:
                await redis.ping()
            return inventory and find_spec("plugin_worker.deployment") is not None

        supported = asyncio.run(probe())
        print("RELEASE_JSON=" + json.dumps({"ready": True, "inventory_supported": supported}))
    elif action == "worker":
        from rapidkit_core.config import settings
        from src.queues.app import app

        arguments = pathlib.Path("/proc/1/cmdline").read_bytes().decode().split("\0")
        hostname = next((value.split("=", 1)[1] for value in arguments if value.startswith("--hostname=")), None)
        if not hostname:
            hostname = next(
                (arguments[i + 1] for i, value in enumerate(arguments[:-1]) if value in ("--hostname", "-n")),
                "celery@" + socket.gethostname(),
            )
        ping = app.control.ping(destination=[hostname], timeout=3)
        print(
            "RELEASE_JSON="
            + json.dumps(
                {
                    "ready": bool(ping),
                    "group": settings.CELERY_WORKER_GROUP,
                    "deployment": settings.CELERY_WORKER_DEPLOYMENT,
                }
            )
        )
    elif action == "inventory":
        from rapidkit_core.database import async_engine
        from sqlalchemy import text

        async def pending():
            async with async_engine.connect() as connection:
                rows = await connection.execute(
                    text("SELECT name, deployment_id FROM worker_groups WHERE deployment_started_at IS NOT NULL")
                )
                return dict(rows.fetchall())

        print("RELEASE_JSON=" + json.dumps({"pending": asyncio.run(pending())}))
    elif action == "beat":
        from rapidkit_core.config import settings
        from redis import Redis

        with Redis.from_url(str(settings.REDIS_URL)) as redis:
            ready = bool(redis.get("leader:celery-beat"))
        print("RELEASE_JSON=" + json.dumps({"ready": ready}))
    else:
        raise ValueError("Unknown application probe")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        # ValidationError repr includes input values; never propagate it into release logs.
        from pydantic import ValidationError

        fields = []
        if isinstance(error, ValidationError):
            fields = [str(item["loc"][0]) for item in error.errors(include_input=False) if item["loc"]]
        print("RELEASE_ERROR=" + json.dumps({"type": type(error).__name__, "fields": fields}))
        sys.exit(1)
