---
name: rapidkit-conventions
description: Universal project conventions for the RapidKit monorepo. Referenced by all domain skills — not triggered directly. Read this skill when another rapidkit-* skill tells you to.
---

## Project Architecture

- **Workspace:** uv workspace (Python) + pnpm/turborepo (TypeScript) monorepo
- **Dependency flow:** plugins -> common -> core (deps flow downward only)

```
apps/
  backend/       — FastAPI + SQLModel + plugin architecture (Python 3.14)
  frontend/      — Vue 3 + NaiveUI + UnoCSS
  desktop/       — Electron
  website/       — Documentation (VitePress)

packages/
  cli/           — TypeScript CLI (citty + clack)
  core/          — Python infrastructure (rapidkit-core)
  common/        — Python shared business layer (rapidkit-common)
  hooks/         — TS composables
  utils/         — TS utilities
  axios/         — TS HTTP client (axios)
  alova/         — TS HTTP client (alova)
  color/         — TS color utilities
  editor/        — TS editor
  builder/       — TS builder
```

## Import Rules

- All imports MUST be at file top level, never inside function bodies
- Exception: plugin `register()` importing its router

**Python priority order:**

1. stdlib
2. `rapidkit_core`
3. `rapidkit_common`
4. `plugin_*`
5. local (relative)

**TypeScript priority order:**

1. node builtins
2. external packages
3. `@rapidkit/*`
4. `@/` (src alias)
5. relative

## Naming Conventions

| Context                             | Convention                 |
| ----------------------------------- | -------------------------- |
| Python files/functions/vars         | `snake_case`               |
| Python classes                      | `PascalCase`               |
| TS functions/vars                   | `camelCase`                |
| TS types/interfaces                 | `PascalCase`               |
| Vue SFC filenames                   | `kebab-case.vue`           |
| Vue component names (defineOptions) | `PascalCase`               |
| DB tables                           | `{plugin}_{entity_plural}` |
| API route URLs                      | `kebab-case`               |

## Logging Rules

```python
# In plugin code:
from rapidkit_core.log import get_plugin_logger

logger = get_plugin_logger("<PluginName>")

# In core/non-plugin code:
from rapidkit_core.log import logger
```

- ALWAYS import `logger` from `rapidkit_core.log` — NEVER use `logging.getLogger()`
- ALWAYS use Loguru `{}` placeholders — NEVER f-string or printf-style in log calls
- In plugin code, ALWAYS use `get_plugin_logger("<PluginName>")` instead of importing `logger` directly — the plugin name is automatically added to log output
- Do NOT manually add `[PluginName]` prefixes to log messages — the `plugin` field in the log format handles this
- ALWAYS include `user_id` in security-related logs
- NEVER log passwords, tokens, or PII
- Log levels: INFO for business events, WARNING for security events, DEBUG for diagnostics

## Timezone Rules

```python
from rapidkit_core.timezone import timezone
```

- `timezone.now()` — returns naive UTC datetime (use for DB storage)
- `timezone.now_local()` — returns aware datetime in configured timezone
- `timezone.f_datetime(dt)` — format datetime to configured timezone string
- `timezone.f_time(dt)` — format datetime to HH:MM:SS in configured timezone
- Use `LocalDatetime` type annotation in response schemas for auto-conversion:
  ```python
  from rapidkit_common.schemas.types import LocalDatetime
  ```
- NEVER use `datetime.now()` or `datetime.utcnow()`

## Exception Rules

- Use `AppException(StatusCode.XXX)` for all business errors — message is auto-translated via i18n:

  ```python
  from rapidkit_core.exceptions import AppException
  from rapidkit_core.status_codes import StatusCode

  # Correct — message auto-translated from StatusCode.description i18n key
  raise AppException(StatusCode.USER_NOT_FOUND)
  raise AppException(StatusCode.DEPARTMENT_HAS_CHILDREN)
  ```

- StatusCode uses 4-digit format: `[type(1)][sequence(3)]` (e.g. 4001 = auth error #1)
- Each StatusCode member maps to an i18n key (e.g. `"common.response.userNotFound"`)
- `AppException.__init__` calls `t(description)` automatically — no manual translation needed
- When no existing StatusCode fits, add a new one:
  1. Add enum member in `packages/core/src/rapidkit_core/status_codes.py`
  2. Add translations in `apps/backend/src/locales/langs/{zh-CN,en-US}/common.json`
- NEVER pass hardcoded user-facing text to `message=` or `data=` — these bypass i18n
- The `data=` parameter is for structured error details (e.g. validation errors), not messages

## Response Envelope

ALL endpoints return `Response[T]`:

```python
from rapidkit_common.schemas.response import Response, PaginatedResponse

@router.get("/users")
async def list_users() -> Response[PaginatedResponse[UserSchema]]:
    ...

@router.get("/user/{id}")
async def get_user() -> Response[UserSchema]:
    ...
```

- Paginated endpoints: `Response[PaginatedResponse[T]]`
- Cursor-paginated: `Response[CursorPaginatedResponse[T]]`
- All schemas auto-alias `snake_case` -> `camelCase` via `BaseModel`

## Common Import Paths

| What                      | Import                                                                  |
| ------------------------- | ----------------------------------------------------------------------- |
| Config singleton          | `from rapidkit_core.config import settings`                             |
| Logger                    | `from rapidkit_core.log import logger`                                  |
| Plugin Logger             | `from rapidkit_core.log import get_plugin_logger`                       |
| Timezone                  | `from rapidkit_core.timezone import timezone`                           |
| AppException              | `from rapidkit_core.exceptions import AppException`                     |
| StatusCode                | `from rapidkit_core.status_codes import StatusCode`                     |
| DB session dep            | `from rapidkit_common.deps import SessionDep`                           |
| Redis dep                 | `from rapidkit_common.deps import RedisDep`                             |
| Base SQLModel             | `from rapidkit_common.models import SQLModel`                           |
| BaseModel (schema)        | `from rapidkit_common.schemas.base import BaseModel`                    |
| Response                  | `from rapidkit_common.schemas.response import Response`                 |
| PaginatedResponse         | `from rapidkit_common.schemas.response import PaginatedResponse`        |
| CursorPaginatedResponse   | `from rapidkit_common.schemas.response import CursorPaginatedResponse`  |
| BaseResponse / BaseSchema | `from rapidkit_common.schemas.response import BaseResponse, BaseSchema` |
| BaseRequest               | `from rapidkit_common.schemas.request import BaseRequest`               |
| PaginatedRequest          | `from rapidkit_common.schemas.request import PaginatedRequest`          |
| LocalDatetime             | `from rapidkit_common.schemas.types import LocalDatetime`               |
| BaseCRUD                  | `from rapidkit_common.crud import BaseCRUD`                             |

## Git Rules

- NEVER run `git add`, `git commit`, `git push`, or any git commands — the user handles all version control

## Rules

### ALWAYS

- Import at file top level (never inside functions)
- Use `get_plugin_logger("<PluginName>")` in plugin code, `logger` in core code
- Use Loguru `{}` placeholders in log messages
- Include `user_id` in security logs
- Use `timezone.now()` for storing timestamps
- Use `LocalDatetime` for datetime fields in response schemas
- Use `AppException(StatusCode.XXX)` for business errors — message auto-translates via i18n
- Add new StatusCode + i18n translations when no existing code fits
- Return `Response[T]` from all endpoints
- Use `snake_case` -> `camelCase` alias via `BaseModel`
- Use UUID7 primary keys (provided by `SQLModel` base class)

### NEVER

- Use `logging.getLogger()` — use `logger` from `rapidkit_core.log`
- Use f-strings or printf-style formatting in log calls
- Use `datetime.now()` or `datetime.utcnow()`
- Log passwords, tokens, or PII
- Manually prefix log messages with [PluginName] — use get_plugin_logger() instead
- Run git commands (user handles version control)
- Import inside function bodies (except plugin `register()` for routers)
- Pass hardcoded user-facing text to AppException `message=` or `data=` — always use StatusCode i18n

### PREFER

- `BaseCRUD[Model]` subclass for DB operations over raw queries
- `SessionDep` / `RedisDep` dependency injection over manual session creation
- Enum-based StatusCode over raw integer codes
- `BaseModel` from `rapidkit_common.schemas.base` over raw Pydantic BaseModel
