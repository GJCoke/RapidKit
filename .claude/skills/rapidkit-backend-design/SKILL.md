---
name: rapidkit-backend-design
description: Create production-grade backend code for the RapidKit project. Use this skill when the user asks to build API endpoints, database models, plugins, Celery tasks, or any Python backend functionality within the FastAPI + SQLModel + plugin architecture. Generates code that follows project conventions and the plugin-based modular design.
license: Complete terms in LICENSE.txt
---

This skill guides creation of production-grade backend code for the **RapidKit** project.
All generated code MUST follow the project's plugin-based architecture, conventions, and patterns described below.

## Project Architecture

RapidKit backend uses a **uv workspace** monorepo with a **plugin-based** modular architecture.
**Python >= 3.14** is required.

```
rapidkit/
├── pyproject.toml                    # Root workspace definition (uv)
├── packages/
│   ├── core/                         # rapidkit-core: infrastructure layer
│   └── common/                       # rapidkit-common: shared business layer
├── apps/
│   └── backend/
│       ├── pyproject.toml            # rapidkit-backend application
│       ├── src/                      # Application shell (entry, middlewares, queues, sio)
│       ├── plugins/                  # Business domain plugins (8 plugins)
│       ├── alembic/                  # Database migrations
│       └── tests/
```

### Three-Layer Architecture

```
┌──────────────────────────────────┐
│  plugins (business domains)      │  plugin-auth, plugin-user, plugin-script,
│  apps/backend/plugins/*/         │  plugin-monitoring, plugin-system, plugin-worker,
│                                  │  plugin-menu, plugin-schedule
├──────────────────────────────────┤
│  rapidkit-common                 │  SQLModel base, CRUD, schemas, deps, enums
│  packages/common/                │
├──────────────────────────────────┤
│  rapidkit-core                   │  config, database, redis, plugin loader,
│  packages/core/                  │  events, security, i18n, timezone, logging
└──────────────────────────────────┘
```

Dependencies flow **downward only**: plugins depend on common and core; common depends on core.

### Application Shell

`apps/backend/src/` contains only infrastructure — no business logic:

```
apps/backend/src/
├── main.py              # FastAPI entry: create_app(), plugin loading, router setup
├── lifecycle.py         # Application lifespan (startup/shutdown)
├── initdb.py            # Database initialization script
├── locales/             # i18n translations
├── middlewares/          # ASGI middlewares (context, i18n, limiter, logger, metrics, state)
├── queues/              # Celery task queue (app, task base, consumer, scheduler, signals)
│   └── tasks/           # Celery task definitions
└── sio/                 # Socket.IO server + event handlers
    └── events/
```

## Plugin System

### Plugin Structure

Each plugin is an **independent uv workspace package** under `apps/backend/plugins/`:

```
plugins/<name>/
├── pyproject.toml                    # Package: rapidkit-plugin-<name>
├── src/plugin_<name>/
│   ├── __init__.py                   # Exposes register() -> PluginManifest
│   └── <domain>/                     # One or more sub-domains
│       ├── api.py                    # FastAPI router endpoints
│       ├── crud.py                   # Database operations
│       ├── models.py                 # SQLModel ORM models
│       ├── schemas.py               # Pydantic request/response schemas
│       ├── services.py              # Business logic
│       └── deps.py                  # Annotated dependencies
├── migrations/                       # Alembic migrations (plugin-managed)
└── tests/
```

### PluginManifest

Every plugin exports a `register()` function that returns a `PluginManifest`:

```python
from rapidkit_core.plugin import MiddlewareDef, PluginManifest

from plugin_my.events import MyEvent, on_my_event
from plugin_my.middleware import MyMiddleware


async def check_health() -> dict:
    return {"status": "healthy"}


def register() -> PluginManifest:
    from plugin_my.api import router

    return PluginManifest(
        name="my_plugin",
        version="0.1.0",
        router=router,
        models=[MyModel],
        dependencies=["auth"],
        on_startup=[startup_callback],
        on_shutdown=[shutdown_callback],
        event_listeners=[
            (MyEvent, on_my_event),
        ],
        dependency_overrides={
            placeholder_dep: real_dep,
        },
        middlewares=[
            MiddlewareDef(cls=MyMiddleware, kwargs={}, order=0),
        ],
    )
```

**PluginManifest fields:**

| Field                  | Type                                        | Description                                                                          |
| ---------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------ |
| `name`                 | `str`                                       | Unique plugin name                                                                   |
| `version`              | `str`                                       | Semver version                                                                       |
| `router`               | `APIRouter \| None`                         | FastAPI router to mount                                                              |
| `models`               | `list[type]`                                | SQLModel table classes                                                               |
| `dependencies`         | `list[str \| PluginDependency]`             | Required plugins; supports version constraints via `PluginDependency`                |
| `permissions`          | `list[PermissionDef]`                       | Permission definitions                                                               |
| `required`             | `bool`                                      | Whether plugin failure is fatal (default `True`)                                     |
| `on_startup`           | `list[Callable]`                            | Async startup callbacks `(app: FastAPI) -> None`                                     |
| `on_shutdown`          | `list[Callable]`                            | Async shutdown callbacks `(app: FastAPI) -> None`                                    |
| `event_listeners`      | `list[tuple[type[Event], Callable[, int]]]` | Typed event listeners; optional third element is priority (lower = first, default 0) |
| `dependency_overrides` | `dict[Callable, Callable]`                  | FastAPI dependency overrides (same as `app.dependency_overrides`)                    |
| `middlewares`          | `list[MiddlewareDef]`                       | Plugin middlewares; `order` controls position (lower = closer to request entry)      |

### Plugin Discovery & Loading

Plugins are discovered via **Python entry points** and configured via `plugins.toml`:

**1. Entry Point declaration** (`pyproject.toml`):

```toml
[project.entry-points."rapidkit.plugins"]
my_plugin = "plugin_my:register"
```

**2. Plugin configuration** (`apps/backend/plugins.toml`):

```toml
[plugins.worker]
enabled = "${ENABLE_CELERY_MONITOR:false}"   # Environment variable with default

[plugins.debug]
enabled = false                               # Statically disabled
```

Plugins not listed in `plugins.toml` are **enabled by default**.

**3. Loading flow** (`main.py`):

```python
from rapidkit_core.loader import discover_and_load_plugins

result = discover_and_load_plugins(config_path=Path(__file__).resolve().parent.parent / "plugins.toml")
app.state.plugins = result.plugins           # Successfully loaded (topologically sorted)
app.state.plugin_load_result = result        # Full result (plugins + disabled + errors + meta)
```

Loading process: `importlib.metadata.entry_points(group="rapidkit.plugins")` → `plugins.toml` filter → `register()` → version check (PEP 440) → **Kahn topological sort** → register event listeners → apply dependency overrides → mount middlewares.

### Existing Plugins

| Plugin              | Package                      | Sub-domains            | Notes                                                         |
| ------------------- | ---------------------------- | ---------------------- | ------------------------------------------------------------- |
| `plugin-auth`       | `rapidkit-plugin-auth`       | auth, role, router     |                                                               |
| `plugin-user`       | `rapidkit-plugin-user`       | user (depends on auth) |                                                               |
| `plugin-script`     | `rapidkit-plugin-script`     | script                 |                                                               |
| `plugin-monitoring` | `rapidkit-plugin-monitoring` | monitoring             |                                                               |
| `plugin-system`     | `rapidkit-plugin-system`     | system                 | Exposes `/system/plugins`, `/system/events`, `/system/health` |
| `plugin-worker`     | `rapidkit-plugin-worker`     | worker, task           | `plugins.toml`: `${ENABLE_CELERY_MONITOR}`                    |
| `plugin-menu`       | `rapidkit-plugin-menu`       | menu                   |                                                               |
| `plugin-schedule`   | `rapidkit-plugin-schedule`   | schedule               | `plugins.toml`: `${ENABLE_CELERY_MONITOR}`                    |

## Core Patterns

### Import Paths

```python
# Core infrastructure
from rapidkit_core.config import settings
from rapidkit_core.database import AsyncSessionLocal, RedisManager
from rapidkit_core.log import logger
from rapidkit_core.timezone import timezone
from rapidkit_core.exceptions import ...
from rapidkit_core.status_codes import StatusCode
from rapidkit_core.uuid7 import uuid7
from rapidkit_core.nanoid import nanoid
from rapidkit_core.security import ...
from rapidkit_core.events import Event, event_bus
from rapidkit_core.context import ...
from rapidkit_core.plugin import MiddlewareDef, PluginDependency, PluginManifest

# Common business layer
from rapidkit_common.models import SQLModel
from rapidkit_common.crud import BaseSQLModelCRUD
from rapidkit_common.deps import SessionDep, RedisDep
from rapidkit_common.schemas.base import BaseModel
from rapidkit_common.schemas.request import BaseRequest, PaginatedRequest, BatchRequest, DeleteRequest, DetailsRequest, SearchRequest
from rapidkit_common.schemas.response import Response, PaginatedResponse, BaseResponse, BaseSchema, ResponseSchema
from rapidkit_common.schemas.types import LocalDatetime
from rapidkit_common.enums import ...

# Cross-plugin imports (use sparingly, declare in dependencies)
from plugin_auth.auth.deps import CurrentUser
```

### ORM Model Pattern

```python
from sqlmodel import Field
from rapidkit_common.models import SQLModel

class MyModel(SQLModel, table=True):
    __tablename__ = "my_table"

    name: str = Field(max_length=100, nullable=False)
    status: str = Field(default="active", max_length=20)
```

`SQLModel` base class provides: `id` (UUID7 primary key), `create_time`, `update_time` (auto-managed).

### CRUD Pattern

```python
from rapidkit_common.crud import BaseSQLModelCRUD
from .models import MyModel
from .schemas import MyCreateSchema, MyUpdateSchema

class MyCRUD(BaseSQLModelCRUD[MyModel, MyCreateSchema, MyUpdateSchema]):
    pass
```

`BaseSQLModelCRUD` provides: `get`, `get_by_ids`, `get_all`, `get_count`, `get_paginate`, `create`, `create_all`, `update`, `update_by_id`, `update_all`, `delete`, `delete_all`.

`get_paginate` returns `PaginatedResponse[T]` and supports a `serializer` parameter for Pydantic conversion.

### Schema Patterns

**BaseModel & Alias Convention:**

All schemas inheriting `BaseModel` automatically convert snake_case to camelCase aliases. The frontend sends/receives camelCase, the backend uses snake_case internally.

```python
from rapidkit_common.schemas.base import BaseModel

class MySchema(BaseModel):
    user_name: str       # Serialized as "userName" in JSON
    page_size: int = 10  # Accepted as "pageSize" from frontend
```

**Response schemas:**

```python
from rapidkit_common.schemas.response import BaseSchema, ResponseSchema
from rapidkit_common.schemas.types import LocalDatetime

class MyItemResponse(BaseSchema):
    # Inherits: id, create_time (LocalDatetime), update_time (LocalDatetime)
    name: str
    status: str
```

**Request schema pattern (CRITICAL):**

NEVER define query parameters as raw `Query()` arguments. Always use schema classes:

```python
# schemas.py
from rapidkit_common.schemas.request import PaginatedRequest

class ItemListQuery(PaginatedRequest):
    sort_by: str = Field("name")         # Auto-aliased to sortBy

# api.py
@router.get("/items")
async def get_items(
    query: Annotated[ItemListQuery, Query(...)],   # camelCase auto-mapped
):
```

**Available request base classes:**

- `BaseRequest` — base for all request schemas (camelCase alias)
- `PaginatedRequest(BaseRequest)` — adds `page` (default 1) and `page_size` (default 10)
- `SearchRequest(BaseRequest)` — adds `keyword: str`
- `DeleteRequest(BaseRequest)` — adds `id: UUID`
- `DetailsRequest(BaseRequest)` — adds `id: UUID`
- `BatchRequest(BaseRequest)` — adds `ids: list[UUID]`

### Response Pattern

All API endpoints return `Response[T]`:

```python
from rapidkit_common.schemas.response import Response, PaginatedResponse

@router.get("/items")
async def get_items() -> Response[list[ItemSchema]]:
    return Response(data=items)

@router.get("/items/paged")
async def get_items_paged() -> Response[PaginatedResponse[ItemSchema]]:
    return Response(data=PaginatedResponse(records=items, total=100, page=1, page_size=10))
```

`Response.message` has a field serializer that auto-translates via i18n.

### Dependency Injection Pattern

```python
# deps.py
from typing import Annotated
from fastapi import Depends

MyServiceDep = Annotated[MyService, Depends()]

# Common deps (from rapidkit_common.deps):
# SessionDep  = Annotated[AsyncSession, Depends(get_async_session)]
# RedisDep    = Annotated[AsyncRedisClient, Depends(get_redis_client)]
```

### API Endpoint Pattern

```python
# api.py
from typing import Annotated
from fastapi import APIRouter, Query
from rapidkit_common.schemas.response import Response, PaginatedResponse
from .schemas import ItemListQuery, ItemCreateRequest, ItemResponse
from .deps import ItemServiceDep

router = APIRouter(prefix="/items", tags=["items"])

@router.get("")
async def get_items(
    query: Annotated[ItemListQuery, Query(...)],
    service: ItemServiceDep,
) -> Response[PaginatedResponse[ItemResponse]]:
    return Response(data=await service.get_paginated(query))

@router.post("")
async def create_item(
    body: ItemCreateRequest,
    service: ItemServiceDep,
) -> Response[ItemResponse]:
    return Response(data=await service.create(body))
```

## Celery Task System

### Task Dependencies

Tasks declare resource needs via type annotations. The `Task` base class auto-injects them:

```python
from src.queues.app import app
from src.queues.deps import TaskRedis, TaskSession

@app.task(name="my_task")
async def my_task(redis: TaskRedis, session: TaskSession) -> None:
    """Task with auto-injected Redis and DB session."""
    # redis: AsyncRedis instance
    # session: async_sessionmaker (use as `async with session() as s:`)
    async with session() as s:
        # ... database operations
        pass
```

**Available dependency types:**

- `TaskRedis` — `redis.asyncio.Redis` instance (auto-created from settings)
- `TaskSession` — `async_sessionmaker` with SQLModel `AsyncSession` (auto-created from settings)

### Celery Beat Schedule

Defined in `src/queues/app.py`:

```python
app.conf.update(
    beat_schedule={
        "my-periodic-task": {
            "task": "my_task_name",
            "schedule": 60.0,  # seconds
        },
    },
)
```

## Timezone Rules

The project uses a **naive UTC storage + automatic local-timezone response** pattern.

| Scenario                            | Approach                                                                         |
| ----------------------------------- | -------------------------------------------------------------------------------- |
| Writing time to DB                  | `timezone.now()` — returns naive UTC datetime                                    |
| Datetime fields in response schemas | Use `LocalDatetime` type — auto-converts to configured timezone on serialization |
| Socket.IO push timestamps           | Use `timezone.f_time()` or `timezone.f_datetime()`                               |

```python
# Model / CRUD layer — getting current time
from rapidkit_core.timezone import timezone
now = timezone.now()  # naive UTC datetime

# Schema layer — response datetime fields
from rapidkit_common.schemas.types import LocalDatetime

class MyResponse(BaseSchema):
    create_time: LocalDatetime    # auto-serialized to "2026-04-13 18:00:00"
    time_bucket: LocalDatetime    # aggregation buckets too
```

**Configuration (`.env`):**

```
DATETIME_TIMEZONE=Asia/Shanghai
DATETIME_FORMAT=%Y-%m-%d %H:%M:%S
```

## Rules

### Logging Rules

- ALWAYS use `from rapidkit_core.log import logger` — NEVER use `logging.getLogger()`
- ALWAYS use Loguru `{}` named params — NEVER use f-string or printf `%s` in log messages
- ALWAYS prefix service-layer logs with `[PluginName]` domain tag (e.g., `[Auth]`, `[Script]`, `[User]`)
- ALWAYS include `user_id` in security-sensitive log messages (login, permission changes, user deletion)
- ALWAYS log state changes (create/update/delete) at INFO or WARNING level
- NEVER log query/read operations (too noisy, handled by LoggerMiddleware at API level)
- NEVER log sensitive data (passwords, tokens, PII) in plain text
- PREFER WARNING for security events (login failure, permission changes, user disable/delete)
- PREFER INFO for normal business events (login success, task created, script executed)
- PREFER DEBUG for internal diagnostics (cache miss, retry, fallback path taken)

### Backend Rules

- NEVER define query parameters as raw `Query()` in API endpoints — always use schema classes with `Annotated[Schema, Query(...)]`
- NEVER bypass the BaseModel alias convention — all request/response schemas must inherit from the appropriate base class
- NEVER put business logic in `apps/backend/src/` — it belongs in a plugin
- NEVER use `datetime.now()` or `datetime.utcnow()` — always use `timezone.now()`
- NEVER manually call `timezone.to_local().strftime()` in CRUD/Service layers for response data
- NEVER use bare `datetime` as a field type in response schemas — always use `LocalDatetime`
- NEVER use `from` or `import` inside function bodies unless necessary to break circular imports (e.g. `register()` importing `router` from `api.py`). All imports belong at the module top level.
- ALWAYS use `Response[T]` envelope for API responses
- ALWAYS follow the plugin directory structure: `__init__.py` (register), then domain dirs with `models.py`, `schemas.py`, `crud.py`, `services.py`, `api.py`, `deps.py`
- ALWAYS declare inter-plugin dependencies in `PluginManifest.dependencies`
- ALWAYS declare entry points in `pyproject.toml` under `[project.entry-points."rapidkit.plugins"]`
- ALWAYS use `Annotated[Dep, Depends()]` pattern for dependency injection
- ALWAYS import from `rapidkit_core` and `rapidkit_common` — never from old `src.common` or `src.core` paths
- PREFER `PaginatedRequest` as base for any paginated query schema
- PREFER `BaseSQLModelCRUD` over writing raw queries

### Git Rules

- NEVER run `git add` or `git commit` — leave all version control operations to the user
- NEVER stage or commit files automatically after generating code
