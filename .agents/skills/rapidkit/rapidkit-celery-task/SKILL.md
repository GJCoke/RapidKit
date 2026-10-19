---
name: rapidkit-celery-task
description: Create and modify Celery tasks for the RapidKit project. Use this skill when the user asks to build async tasks, periodic scheduled tasks, or task queue configurations. Trigger whenever the user mentions Celery, background jobs, task queues, Beat schedule, periodic tasks, or worker tasks.
---

# RapidKit Celery Task

Project paths below are relative to the repository root. Python module names are resolved by the backend runtime.

## Prerequisites

Read `rapidkit-conventions` first. Business tasks belong to their owning plugin; use `rapidkit-plugin` for plugin registration and `rapidkit-migration` for schema changes.

## Directory Layout

```text
apps/backend/src/queues/
├── app.py          # Celery configuration; merges plugin task modules and schedules
├── celery.py       # Custom Celery class, Task is the default base
├── deps.py         # TaskRedis and TaskSession markers
├── task.py         # Async execution, DI, identity propagation, resource cleanup
└── tasks/
    └── schedule_test.py  # Explicitly registered core task module

apps/backend/plugins/<name>/src/plugin_<name>/
├── __init__.py     # register(): task_modules and beat_schedule
└── tasks.py        # Plugin-owned tasks, e.g. plugin_monitoring.tasks
```

## Task Definitions and Dependencies

Use `@app.task(name="...")` with a stable, unique name. The custom Task base injects `TaskRedis` / `TaskSession` parameters on the worker; callers supply only business arguments.

```python
from src.queues.app import app
from src.queues.deps import TaskRedis, TaskSession


@app.task(name="process_user_report")
async def process_user_report(user_id: str, redis: TaskRedis, session: TaskSession) -> None:
    await redis.set(f"report:{user_id}:status", "processing")
    async with session() as db:
        # Perform the report's database work here.
        # Commit writes explicitly; a session context alone does not commit.
        await db.commit()
```

The markers in `apps/backend/src/queues/deps.py` are:

```python
from typing import NewType

from rapidkit_core.redis_client import AsyncRedisClient
from sqlalchemy.ext.asyncio import async_sessionmaker

TaskRedis = NewType("TaskRedis", AsyncRedisClient)
TaskSession = NewType("TaskSession", async_sessionmaker)
```

- `TaskRedis`: `AsyncRedisClient` created from `settings.REDIS_URL` with `decode_responses=True`, closed after task completion.
- `TaskSession`: an `async_sessionmaker` using SQLModel `AsyncSession`, bound to `settings.ASYNC_DATABASE_POSTGRESQL_URL`; its engine is disposed after task completion.
- Use `async with session() as db:` to close the session. For writes, explicitly commit/rollback or use `async with db.begin():` for transaction management.
- The custom Task also propagates actor/subject identity in task headers. Preserve this Task base when adding tasks; see `apps/backend/src/queues/task.py`.

## Task Module Registration

Creating a file in `src/queues/tasks/` does not register it automatically. `apps/backend/src/queues/app.py:configure_from_plugins()` builds `app.conf.imports` from `_CORE_TASK_MODULES` plus every loaded plugin's `task_modules`.

For business tasks, add the module path to the owning plugin's existing manifest:

```python
from rapidkit_framework.plugin import PluginManifest


def register() -> PluginManifest:
    return PluginManifest(
        name="order",
        version="0.1.0",
        # Retain the plugin's existing router, models, resources and services.
        task_modules=["plugin_order.tasks"],
    )
```

Only cross-cutting core tasks go into `_CORE_TASK_MODULES`. Current core entries are `src.sio.tasks` and `src.queues.tasks.schedule_test`. Task loading uses explicit module paths, not a directory scan. Avoid manually importing task modules inside `app.py` or a plugin registration module; use the registration lists instead.

The reference implementation is `apps/backend/plugins/monitoring/src/plugin_monitoring/__init__.py`, with tasks in `apps/backend/plugins/monitoring/src/plugin_monitoring/tasks.py`.

## Periodic Schedules

Add business schedules to the plugin's `PluginManifest.beat_schedule`, alongside `task_modules`, rather than replacing `app.conf.beat_schedule` in the application shell:

```python
from celery.schedules import crontab
from rapidkit_framework.plugin import PluginManifest


def register() -> PluginManifest:
    return PluginManifest(
        name="order",
        version="0.1.0",
        # Retain all other existing manifest fields.
        task_modules=["plugin_order.tasks"],
        beat_schedule={
            "order-daily-report": {
                "task": "process_user_report",
                "schedule": crontab(hour=2, minute=30),
                "kwargs": {"user_id": "00000000-0000-0000-0000-000000000001"},
            },
        },
    )
```

`configure_from_plugins()` merges `_CORE_BEAT_SCHEDULE` and plugin schedules into `app.conf.beat_schedule`. Schedule keys must be unique across plugins; duplicate keys would overwrite earlier entries. The `task` name must exactly match the decorator's `name`, and `args`/`kwargs` must contain the task's business arguments, not DI parameters. The UUID above is example configuration; use the actual business target when defining a per-user schedule.

Schedule forms include `60.0` (seconds), `crontab(hour=3, minute=0)` and `crontab(day_of_week="mon-fri", hour=9)`. Application timezone comes from `settings.DATETIME_TIMEZONE`.

For schedules that operators create or edit at runtime, use the schedule plugin; static manifest schedules describe plugin-owned recurring work.

## Adding and Calling a Task

1. Create the task module under the owning plugin and define its async task with an explicit name and typed DI parameters.
2. Add its module path to the plugin's existing `task_modules` list.
3. If periodic, add an entry to that manifest's `beat_schedule`, including required business arguments.
4. Follow existing plugin task modules for imports and transaction boundaries; do not open an independently scoped request session.
5. From backend code, import the task and publish it with business arguments only:

```python
from plugin_order.tasks import process_user_report

process_user_report.apply_async(kwargs={"user_id": str(user_id)})
```

## Rules

- Declare DI with the actual `TaskRedis` / `TaskSession` marker types; do not pass these parameters through `apply_async`.
- Use explicit names for tasks referenced by schedules or sent by name.
- Keep plugin-owned tasks and static schedules in the owning plugin manifest; preserve existing entries when adding a task.
- Use `async def` for DI or asynchronous I/O, and explicitly manage database transactions in tasks.
- Request row/field rules are not automatically bound to task sessions. Pass already-authorized targets into tasks; identity propagation does not grant request data scopes.
- Prefer module-level imports. Defer plugin imports only when needed to break an actual initialization cycle, following the current owning plugin's task module.
