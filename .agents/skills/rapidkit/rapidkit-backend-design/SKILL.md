---
name: rapidkit-backend-design
description: Create production-grade backend code for the RapidKit project. Use this skill when the user asks to build API endpoints, database models, plugins, Celery tasks, or any Python backend functionality within the FastAPI + SQLModel + plugin architecture. Generates code that follows project conventions and the plugin-based modular design.
---

This skill guides creation of production-grade backend code for the **RapidKit** project.
All generated code MUST follow the project's plugin-based architecture, conventions, and patterns described below.

Unless explicitly described as relative to a package or source file, project paths in this skill are relative to the repository root.

## Prerequisites

Read `rapidkit-conventions` first for shared project rules and the repository-wide Git policy. Follow the task branch already initialized for this task; do not create a new branch merely because another skill is loaded. The Lean Code Rules in `rapidkit-conventions` (no over-defense without approval, validate once at the entry, no early abstraction, minimal `try/catch`) bind all code written here, and its Document Writing Rules bind every document and report you write for the user.

## Project Architecture

Python >= 3.14, uv workspace, plugin-based. The package layout and dependency flow are in `rapidkit-conventions` (Project Architecture).

### Application Shell

`apps/backend/src` contains only infrastructure — no business logic:

```
apps/backend/src/
├── main.py              # FastAPI entry: create_app(), plugin loading, router setup
├── lifecycle.py         # Application lifespan (startup/shutdown)
├── initdb.py            # Database initialization script
├── locales/             # i18n translations
├── middlewares/          # ASGI middlewares (audit, context, i18n, limiter, logger, metrics, security, state)
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
│   ├── audit.py          # AUDIT_ROUTES for write routes (see Business Audit)
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

**PluginManifest fields:** the full list is in `packages/framework/src/rapidkit_framework/plugin.py` (`PluginManifest`). The most used are `name`, `version`, `router`, `models`, `dependencies` (names or `PluginDependency` with a version constraint) and `resources` / `permission_codes` (see `rapidkit-permission`). Celery fields are in `rapidkit-celery-task`.

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
enabled = "${ENABLE_CELERY_MONITOR:true}"    # Environment variable with default

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

The plugins are the directories under `apps/backend/plugins/`. Each plugin's `pyproject.toml` and `register()` manifest are the source of truth for its package name and dependencies.

## Core Patterns

### Import Paths

Use the Common Import Paths table in `rapidkit-conventions`. Get the current user and auth context through `rapidkit_common.auth` (e.g. `from rapidkit_common.auth import UserDBDep`), not from another plugin. Importing a `plugin_*` package directly is the exception and needs that plugin in `PluginManifest.dependencies`.

### ORM Model Pattern

```python
from sqlmodel import Field
from rapidkit_common.models import SQLModel

class MyModel(SQLModel, table=True):
    __tablename__ = "my_table"

    name: str = Field(max_length=100, nullable=False)
    status: str = Field(default="active", max_length=20)
```

`SQLModel` base class provides: `id` (UUID7 primary key), `create_time`, `update_time` (auto-managed) and `created_by` (creator ID, nullable).

### CRUD Pattern

```python
from rapidkit_common.crud import BaseCRUD
from .models import MyModel

class MyCRUD(BaseCRUD[MyModel]):
    model = MyModel
```

Read `packages/common/src/rapidkit_common/crud.py` for the `BaseCRUD` methods before writing a query.

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

All endpoints return `Response[T]`; see Response Envelope in `rapidkit-conventions`. `Response.message` is translated through i18n.

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

### Business Audit

Every new POST/PUT/PATCH/DELETE route needs an entry in the plugin's `AUDIT_ROUTES` (`audit.py`), keyed by the endpoint function name: an `AuditActionDef` to audit it, or `None` to exclude it explicitly. An undeclared route still gets a generic audit record (action `http.request`, result UNKNOWN) but no action name, resource or field summary, and nothing reports the gap. Return the definitions through `audit_actions` in the manifest. Follow `apps/backend/plugins/user/src/plugin_user/audit.py`; add the `audit.*` i18n keys it references to `apps/backend/src/locales/langs/{zh-CN,en-US}/audit.json`.

## Celery Tasks

Follow `rapidkit-celery-task`.

## Timezone Rules

Follow the Timezone Rules in `rapidkit-conventions`. Store naive UTC with `timezone.now()`; Socket.IO timestamps use the same instant convention as HTTP; formatted strings only for pure text. The configured zone is `DATETIME_TIMEZONE` and the `LocalDatetime` text format is `DATETIME_FORMAT` (e.g. `%Y-%m-%d %H:%M:%S` → `2026-04-13 18:00:00`), with defaults in `packages/core/src/rapidkit_core/config.py` that `.env` can override.

## Rules

### Logging Rules

Follow the Logging Rules in `rapidkit-conventions`, plus:

- Do not log API create/update/delete as INFO: the business audit records them. Log state changes that no audited route covers (background jobs, external calls, scheduled cleanup) at INFO, and degradation or recovery at WARNING
- NEVER log query/read operations (too noisy, handled by LoggerMiddleware at API level)
- Security-sensitive logs (login, permission changes, user deletion) include `user_id`

### Backend Rules

- NEVER define query parameters as raw `Query()` in API endpoints — always use schema classes with `Annotated[Schema, Query(...)]`
- NEVER bypass the BaseModel alias convention — all request/response schemas must inherit from the appropriate base class
- NEVER put business logic in `apps/backend/src` — it belongs in a plugin
- NEVER manually call `timezone.to_local().strftime()` in CRUD/Service layers for response data
- Use `UTCInstant` / `EditableInstant` for response instants, `LocalDatetime` for pure display, and `date` for calendar labels; avoid unmarked `datetime` responses.
- Follow the shared import policy in `rapidkit-conventions`: prefer module-level imports and allow narrow, justified initialization-cycle or test-bootstrap exceptions.
- ALWAYS use `Response[T]` envelope for API responses
- Use a flat plugin layout for one domain; introduce domain subdirectories only for multiple subdomains, as described in `rapidkit-plugin`.
- ALWAYS declare inter-plugin dependencies in `PluginManifest.dependencies`
- ALWAYS declare entry points in the owning plugin's `pyproject.toml` under `[project.entry-points."rapidkit.plugins"]`
- ALWAYS use `Annotated[Dep, Depends()]` pattern for dependency injection
- Import from `rapidkit_core`, `rapidkit_framework`, `rapidkit_common` and `rapidkit_security` according to package ownership; never use old `src.common` or `src.core` paths.
- PREFER `PaginatedRequest` as base for any paginated query schema
- PREFER `BaseCRUD` over writing raw queries
- Request and query schemas are the entry validation. Services and CRUD trust the validated types; do not re-check a field the schema already guarantees.
- Raise `AppException` and let it propagate to the framework handler. Use `try/except` only to roll back, release a resource or translate a third-party error at the boundary; never to log and re-raise.
