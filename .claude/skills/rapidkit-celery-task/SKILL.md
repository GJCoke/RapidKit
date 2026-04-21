---
name: rapidkit-celery-task
description: Create and modify Celery tasks for the RapidKit project. Use this skill when the user asks to build async tasks, periodic scheduled tasks, or task queue configurations. Trigger whenever the user mentions Celery, background jobs, task queues, Beat schedule, periodic tasks, or worker tasks.
---

# RapidKit Celery Task

## Prerequisites

Read `rapidkit-conventions` skill first for universal project rules (file headers, import style, naming).

## Scope

This skill covers:

- Task definitions with async support
- Dependency injection via TaskRedis / TaskSession type annotations
- Beat scheduling (periodic tasks)
- Autodiscovery of task modules

Out of scope (use other skills):

- Backend plugin creation -> use `rapidkit-plugin`
- Database migrations -> use `rapidkit-migration`

## Directory Layout

```
apps/backend/src/queues/
├── app.py          # Celery app + beat_schedule + autodiscover
├── celery.py       # Custom Celery class (sets Task as default base)
├── deps.py         # TaskRedis, TaskSession type markers
├── task.py         # Custom Task base (async + DI injection)
├── tasks/          # Task modules (auto-discovered)
│   ├── __init__.py
│   ├── tasks.py
│   └── aggregate_metrics.py
```

## Core Patterns

### 1. Task Definition with DI

Tasks are async functions decorated with `@app.task`. The custom Task base class automatically detects `TaskRedis` and `TaskSession` type annotations and injects live instances at runtime on the worker side. Callers never pass these DI parameters -- they are resolved transparently.

```python
from src.queues.app import app
from src.queues.deps import TaskRedis, TaskSession


@app.task(name="my_task_name")
async def my_task(some_arg: str, redis: TaskRedis, session: TaskSession) -> None:
    """Task docstring."""
    # redis is an AsyncRedis instance (decode_responses=True)
    await redis.set(f"key:{some_arg}", "value")

    # session is an async_sessionmaker -- use context manager
    async with session() as s:
        result = await s.execute(...)
```

Key points:

- The `name` kwarg in `@app.task(name="...")` gives the task a stable identifier used in Beat schedule and `apply_async` calls. Without it, Celery auto-generates a name from the module path which breaks if you move the file.
- DI parameters (TaskRedis, TaskSession) are detected by type annotation -- they must appear as function parameters with the correct type.
- Non-DI parameters (like `some_arg`) are passed normally via `apply_async(args=(...,))` or `apply_async(kwargs={...})`.

### 2. TaskRedis / TaskSession Types

Defined in `src/queues/deps.py`:

```python
from typing import NewType
from redis.asyncio import Redis as AsyncRedis
from sqlalchemy.ext.asyncio import async_sessionmaker

TaskRedis = NewType("TaskRedis", AsyncRedis)
TaskSession = NewType("TaskSession", async_sessionmaker)
```

**TaskRedis** -- an `AsyncRedis` instance connected to `settings.REDIS_URL` with `decode_responses=True`. Auto-closed after task completes.

**TaskSession** -- an `async_sessionmaker` bound to an async engine pointing at `settings.ASYNC_DATABASE_POSTGRESQL_URL`. The engine is disposed after task completes. Usage pattern:

```python
async with session() as s:
    # s is an AsyncSession
    await s.execute(select(MyModel).where(...))
```

### 3. Beat Schedule

Periodic tasks are registered in `app.conf.beat_schedule` inside `src/queues/app.py`:

```python
from celery.schedules import crontab

app.conf.beat_schedule = {
    "aggregate-api-metrics": {
        "task": "aggregate_api_metrics",   # matches @app.task(name=...)
        "schedule": 60.0,                  # every 60 seconds
    },
    "cleanup-old-api-metrics": {
        "task": "cleanup_old_api_metrics",
        "schedule": crontab(hour=3, minute=0),  # daily at 03:00
    },
}
```

The `"task"` value must exactly match the `name` argument in the `@app.task(name="...")` decorator.

### 4. Autodiscovery

Task modules placed in `src/queues/tasks/` are automatically discovered. The mechanism in `app.py` uses `pkgutil.iter_modules` to scan all submodules:

```python
import pkgutil
import src.queues.tasks as _tasks_pkg

for _info in pkgutil.iter_modules(_tasks_pkg.__path__):
    app.autodiscover_tasks(["src.queues.tasks"], related_name=_info.name)
```

You never need to manually import or register task modules -- just create a `.py` file in `src/queues/tasks/` and it will be picked up.

## Step-by-Step Operations

### Operation 1: Create a New Async Task

1. Create a new file in `apps/backend/src/queues/tasks/` (e.g., `my_feature.py`)
2. Add the standard file header
3. Import `app` from `src.queues.app` and any needed DI types from `src.queues.deps`
4. Define the async task function with `@app.task(name="descriptive_task_name")`
5. Add DI type annotations for any needed resources (TaskRedis, TaskSession)

```python
"""
My feature Celery tasks.

Author : Name
Date   : YYYY-MM-DD
"""

from src.queues.app import app
from src.queues.deps import TaskSession


@app.task(name="process_user_report")
async def process_user_report(user_id: int, session: TaskSession) -> None:
    """Generate and store a user report asynchronously."""
    async with session() as s:
        # query and process data
        ...
```

The task is now callable from anywhere:

```python
from src.queues.tasks.my_feature import process_user_report

process_user_report.apply_async(kwargs={"user_id": 42})
```

### Operation 2: Create a Periodic Beat Task

1. Follow Operation 1 to create the task file and function
2. Open `apps/backend/src/queues/app.py`
3. Add an entry to `app.conf.beat_schedule`:

```python
app.conf.beat_schedule = {
    # ... existing entries ...
    "my-periodic-task": {
        "task": "process_user_report",        # must match name= in decorator
        "schedule": crontab(hour=2, minute=30),  # or a float for seconds
    },
}
```

For schedule options:

- `60.0` -- run every 60 seconds
- `crontab(minute=0, hour="*/2")` -- every 2 hours
- `crontab(hour=3, minute=0)` -- daily at 03:00
- `crontab(day_of_week="mon-fri", hour=9)` -- weekdays at 09:00

## Rules

- ALWAYS use type annotations for DI parameters (TaskRedis, TaskSession) -- this is how injection works
- ALWAYS use `async with session() as s:` when accessing the database via TaskSession -- never call `session` directly without the context manager
- NEVER import task modules manually in app.py or **init**.py -- autodiscovery handles registration
- ALWAYS provide an explicit `name=` argument to `@app.task()` for tasks referenced in Beat schedule or called via `apply_async` by name
- PREFER descriptive, unique task names using snake_case (e.g., `"aggregate_api_metrics"`, `"cleanup_old_api_metrics"`)
- ALWAYS use `async def` for task functions that need DI or perform I/O
- Keep heavy imports inside the task body (not at module top) when they pull in plugin code that may not be available at import time -- this follows the pattern seen in `aggregate_metrics.py`
