---
name: rapidkit-backend-design
description: Create production-grade backend code for the RapidKit project. Use this skill when the user asks to build API endpoints, database models, plugins, Celery tasks, or any Python backend functionality within the FastAPI + SQLModel + plugin architecture. Generates code that follows project conventions and the plugin-based modular design.
---

This skill guides creation of production-grade backend code for the **RapidKit** project.
All generated code MUST follow the project's plugin-based architecture, conventions, and patterns described below.

Unless explicitly described as relative to a package or source file, project paths in this skill are relative to the repository root.

## Prerequisites

Read `rapidkit-conventions` first for shared project rules and the repository-wide Git policy. Follow the task branch already initialized for this task; do not create a new branch merely because another skill is loaded.

## Project Architecture

RapidKit backend uses a **uv workspace** monorepo with a **plugin-based** modular architecture.
**Python >= 3.14** is required.

```
rapidkit/
├── pyproject.toml                    # Root workspace definition (uv)
├── packages/
│   ├── core/                         # rapidkit-core: infrastructure layer
│   ├── common/                       # rapidkit-common: shared business layer
│   ├── framework/                    # rapidkit-framework: plugin/HTTP runtime
│   └── security/                     # rapidkit-security: JWT/password/RSA
├── apps/
│   └── backend/
│       ├── pyproject.toml            # rapidkit-backend application
│       ├── src/                      # Application shell (entry, middlewares, queues, sio)
│       ├── plugins/                  # Business domain plugins
│       ├── alembic/                  # Database migrations
│       └── tests/
```

### Package Architecture

```text
plugins -> rapidkit-common -> rapidkit-framework -> rapidkit-core
                          \-> rapidkit-core

rapidkit-security: standalone JWT, password hashing and RSA utilities
```

- `rapidkit-core`: configuration, database, Redis, timezone and logging.
- `rapidkit-framework`: plugin discovery/manifests, service registry, event bus, HTTP exceptions/status codes, i18n, request identity and scopes; depends on core.
- `rapidkit-common`: shared SQLModel/CRUD/schemas, protocols, access and scope runtime; depends on framework and core.
- Plugins declare their direct package dependencies and communicate through shared protocols/services or events where appropriate. Stateful core/framework code must not depend on business plugins.

### Application Shell

`apps/backend/src` contains only infrastructure — no business logic:

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

Each plugin is an independent uv workspace package under `apps/backend/plugins/<name>/`.

```text
plugins/<name>/
├── pyproject.toml
├── src/plugin_<name>/
│   ├── __init__.py       # register() -> PluginManifest
│   ├── permissions.py    # Resource and permission declarations
│   ├── api.py
│   ├── crud.py
│   ├── models.py
│   ├── schemas.py
│   ├── services.py
│   └── deps.py
├── migrations/versions/
└── tests/
```

Use the flat layout for a single domain. Split API/CRUD/models/schemas/services/deps into domain subdirectories only when a plugin has multiple subdomains; keep registration and shared permission declarations at plugin root. For example, the permission plugin has `role/` and `router/` subdomains. Follow `rapidkit-plugin` for scaffolding.

### PluginManifest

Every plugin exports a `register()` function that returns a `PluginManifest`:

```python
from rapidkit_framework.plugin import MiddlewareDef, PluginManifest

from plugin_my.events import MyEvent, on_my_event
from plugin_my.middleware import MyMiddleware
from plugin_my.models import MyModel
from plugin_my.permissions import PERMISSION_CODES, RESOURCES


async def check_health() -> dict:
    return {"status": "healthy"}


def register() -> PluginManifest:
    from plugin_my.api import router

    return PluginManifest(
        name="my_plugin",
        version="0.1.0",
        router=router,
        models=[MyModel],
        resources=RESOURCES,
        permission_codes=PERMISSION_CODES,
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
| `resources`            | `list[ResourceDef]`                         | Controlled resources (see `rapidkit-permission`)                                     |
| `permission_codes`     | `list[PermissionCodeDef]`                   | Permission codes `资源:动作` (see `rapidkit-permission`)                              |
| `permission_packages`  | `list[PermissionPackageDef]`                | Built-in permission packages (see `rapidkit-permission`)                             |
| `required`             | `bool`                                      | Whether plugin failure is fatal (default `True`)                                     |
| `on_startup`           | `list[Callable]`                            | Async startup callbacks `(app: FastAPI) -> None`                                     |
| `on_shutdown`          | `list[Callable]`                            | Async shutdown callbacks `(app: FastAPI) -> None`                                    |
| `event_listeners`      | `list[tuple[type[Event], Callable[, int]]]` | Typed event listeners; optional third element is priority (lower = first, default 0) |
| `dependency_overrides` | `dict[Callable, Callable]`                  | FastAPI dependency overrides (same as `app.dependency_overrides`)                    |
| `middlewares`          | `list[MiddlewareDef]`                       | Plugin middlewares; `order` controls position (lower = closer to request entry)      |
| `provides` / `requires` | `list[type]` | Service protocols provided/required by the plugin |
| `service_factories` | `dict[type, Callable]` | Protocol-to-registration-factory mapping |
| `task_modules` | `list[str]` | Import paths of Celery task modules |
| `beat_schedule` | `dict[str, dict]` | Plugin-owned periodic schedules |
| `sio_modules` | `list[str]` | Socket.IO event modules |
| `dashboard_modules` | `list[DashboardModuleDef]` | Dashboard permission and realtime topic metadata |

### Plugin Discovery & Loading

Plugins are discovered via **Python entry points** and configured via `plugins.toml`:

**1. Entry Point declaration** (`apps/backend/plugins/<name>/pyproject.toml`):

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
from rapidkit_framework.loader import discover_and_load_plugins

result = discover_and_load_plugins(config_path=Path(__file__).resolve().parent.parent / "plugins.toml")
app.state.plugins = result.plugins           # Successfully loaded (topologically sorted)
app.state.plugin_load_result = result        # Full result (plugins + disabled + errors + meta)
```

Loading process: `importlib.metadata.entry_points(group="rapidkit.plugins")` → `plugins.toml` filter → `register()` → version check (PEP 440) → **Kahn topological sort** → register event listeners → apply dependency overrides → mount middlewares.

### Existing Plugins

| Plugin | Package | Responsibility |
| ------ | ------- | -------------- |
| `auth` | `rapidkit-plugin-auth` | Authentication, invite/reset flows, impersonation |
| `user` | `rapidkit-plugin-user` | User administration and profiles |
| `department` | `rapidkit-plugin-department` | Department hierarchy |
| `permission` | `rapidkit-plugin-permission` | Roles, route access, permission catalog/packages/extensions |
| `menu` | `rapidkit-plugin-menu` | Menus and navigation |
| `monitoring` | `rapidkit-plugin-monitoring` | API monitoring |
| `system` | `rapidkit-plugin-system` | System information, health and audit |
| `worker` | `rapidkit-plugin-worker` | Workers, task execution and statistics |
| `schedule` | `rapidkit-plugin-schedule` | Periodic task management |
| `notification` | `rapidkit-plugin-notification` | Notifications and templates |

Use the actual plugin `pyproject.toml` files and manifests as the source of truth when adding dependencies.

## Core Patterns

### Import Paths

```python
# Core infrastructure
from rapidkit_core.config import settings
from rapidkit_core.database import AsyncSessionLocal, RedisManager
from rapidkit_core.log import logger
from rapidkit_core.timezone import timezone
from rapidkit_framework.exceptions import AppException
from rapidkit_framework.status_codes import StatusCode
from rapidkit_core.uuid7 import uuid7
from rapidkit_core.nanoid import nanoid
from rapidkit_security import AccessJWT, decode_token, hash_password
from rapidkit_framework.events import Event, event_bus
from rapidkit_framework.context import ctx
from rapidkit_framework.plugin import MiddlewareDef, PluginDependency, PluginManifest

# Common business layer
from rapidkit_common.models import SQLModel
from rapidkit_common.crud import BaseCRUD
from rapidkit_common.deps import SessionDep, RedisDep
from rapidkit_common.schemas.base import BaseModel
from rapidkit_common.schemas.request import BaseRequest, PaginatedRequest, BatchRequest, DeleteRequest, DetailsRequest, SearchRequest
from rapidkit_common.access import Require
from rapidkit_common.schemas.response import Response, PaginatedResponse, BaseResponse, BaseSchema, ResponseSchema
from rapidkit_common.schemas.types import LocalDatetime
from rapidkit_common.enums import Status, TaskStatus, WorkerStatus

# Cross-plugin imports (use sparingly, declare in dependencies)
from plugin_auth.auth.deps import AuthContextDep, UserDBDep
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
from rapidkit_common.crud import BaseCRUD
from .models import MyModel

class MyCRUD(BaseCRUD[MyModel]):
    model = MyModel
```

`BaseCRUD` provides: `get`, `get_by_ids`, `get_all`, `get_count`, `get_paginate`, `get_paginate_by_cursor`, `create`, `create_all`, `update_by_id`, `update_all`, `delete`, `delete_all`, `exists`.

Subclass must declare `model` ClassVar. Constructor takes only `session: AsyncSession`. CRUD methods only `flush()` — the request dependency commits on success and rolls back on failure. For manually opened sessions, explicitly commit/rollback or use a transaction context such as `async with session.begin()`; `async with session()` alone does not commit. Query methods support an optional `schema` parameter for Pydantic conversion.

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
from pydantic import Field
from rapidkit_common.schemas.request import PaginatedRequest

class ItemListQuery(PaginatedRequest):
    sort_by: str = Field("name")         # Auto-aliased to sortBy

# api.py
from typing import Annotated
from fastapi import Query
from rapidkit_common.access import Require

@router.get("/items", dependencies=[Require("item:read")])
async def get_items(
    query: Annotated[ItemListQuery, Query(...)],   # camelCase auto-mapped
):
    ...
```

**Available request base classes:**

- `BaseRequest` — base for all request schemas (camelCase alias)
- `PaginatedRequest(BaseRequest)` — adds `page` (default 1) and `page_size` (default 20, maximum 500)
- `SearchRequest(BaseRequest)` — adds `keyword: str`
- `DeleteRequest(BaseRequest)` — adds `id: UUID`
- `DetailsRequest(BaseRequest)` — adds `id: UUID`
- `BatchRequest(BaseRequest)` — adds `ids: list[UUID]`

### Response Pattern

All API endpoints return `Response[T]`:

```python
from rapidkit_common.access import Require
from rapidkit_common.schemas.response import Response, PaginatedResponse

@router.get("/items", dependencies=[Require("item:read")])
async def get_items() -> Response[list[ItemSchema]]:
    return Response(data=items)

@router.get("/items/paged", dependencies=[Require("item:read")])
async def get_items_paged() -> Response[PaginatedResponse[ItemSchema]]:
    return Response(data=PaginatedResponse(records=items, total=100, page=1, page_size=20))
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

Every mounted route needs exactly one `Require`, `Authenticated` or `Public` declaration. The example assumes resource `item` and codes `item:read` / `item:create` are declared in `permissions.py` and wired into the manifest; follow `rapidkit-permission`. Use `Scope` when the endpoint needs the authorized user or field serialization.

```python
# api.py
from typing import Annotated
from fastapi import APIRouter, Query
from rapidkit_common.access import Require
from rapidkit_common.schemas.response import Response, PaginatedResponse
from .schemas import ItemListQuery, ItemCreateRequest, ItemResponse
from .deps import ItemServiceDep

router = APIRouter(prefix="/items", tags=["items"])

@router.get("", dependencies=[Require("item:read")])
async def get_items(
    query: Annotated[ItemListQuery, Query(...)],
    service: ItemServiceDep,
) -> Response[PaginatedResponse[ItemResponse]]:
    return Response(data=await service.get_paginated(query))

@router.post("", dependencies=[Require("item:create")])
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

- `TaskRedis` — `rapidkit_core.redis_client.AsyncRedisClient` instance (auto-created from settings)
- `TaskSession` — `async_sessionmaker` with SQLModel `AsyncSession` (auto-created from settings)

### Celery Modules and Beat Schedule

Declare business task modules in `PluginManifest.task_modules` and periodic entries in `PluginManifest.beat_schedule`, inside the owning plugin's `register()` function. `apps/backend/src/queues/app.py:configure_from_plugins()` merges these with core modules/schedules and sets `app.conf.imports` / `app.conf.beat_schedule`.

See `rapidkit-celery-task` and `apps/backend/plugins/monitoring/src/plugin_monitoring/__init__.py`. New files in `src/queues/tasks/` are not scanned automatically.

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

- In plugins, use `from rapidkit_core.log import get_plugin_logger` and `logger = get_plugin_logger("PluginName")`; infrastructure may use the global `logger`. Never use `logging.getLogger()`.
- ALWAYS use Loguru `{}` named params — NEVER use f-string or printf `%s` in log messages
- Do not manually prefix messages with `[PluginName]`; `get_plugin_logger()` binds the plugin field for the formatter.
- ALWAYS include `user_id` in security-sensitive log messages (login, permission changes, user deletion)
- ALWAYS log state changes (create/update/delete) at INFO or WARNING level
- NEVER log query/read operations (too noisy, handled by LoggerMiddleware at API level)
- NEVER log sensitive data (passwords, tokens, PII) in plain text
- PREFER WARNING for security events (login failure, permission changes, user disable/delete)
- PREFER INFO for normal business events (login success, task created, notification sent)
- PREFER DEBUG for internal diagnostics (cache miss, retry, fallback path taken)

### Backend Rules

- NEVER define query parameters as raw `Query()` in API endpoints — always use schema classes with `Annotated[Schema, Query(...)]`
- NEVER bypass the BaseModel alias convention — all request/response schemas must inherit from the appropriate base class
- NEVER put business logic in `apps/backend/src` — it belongs in a plugin
- NEVER use `datetime.now()` or `datetime.utcnow()` — always use `timezone.now()`
- NEVER manually call `timezone.to_local().strftime()` in CRUD/Service layers for response data
- NEVER use bare `datetime` as a field type in response schemas — always use `LocalDatetime`
- Follow the shared import policy in `rapidkit-conventions`: prefer module-level imports and allow narrow, justified initialization-cycle or test-bootstrap exceptions.
- ALWAYS use `Response[T]` envelope for API responses
- Use a flat plugin layout for one domain; introduce domain subdirectories only for multiple subdomains, as described in `rapidkit-plugin`.
- ALWAYS declare inter-plugin dependencies in `PluginManifest.dependencies`
- ALWAYS declare entry points in the owning plugin's `pyproject.toml` under `[project.entry-points."rapidkit.plugins"]`
- ALWAYS use `Annotated[Dep, Depends()]` pattern for dependency injection
- Import from `rapidkit_core`, `rapidkit_framework`, `rapidkit_common` and `rapidkit_security` according to package ownership; never use old `src.common` or `src.core` paths.
- PREFER `PaginatedRequest` as base for any paginated query schema
- PREFER `BaseCRUD` over writing raw queries

### Git Rules

Follow `rapidkit-conventions` and the root `AGENTS.md`: each new task starts on a fresh branch; validated implementation changes may be committed automatically, while design documents and plans must never be staged or committed. Preserve unrelated pre-existing work and do not push or merge without explicit authorization.
