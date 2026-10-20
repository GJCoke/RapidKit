---
name: rapidkit-conventions
description: Universal project conventions for the RapidKit monorepo. Referenced by all domain skills — not triggered directly. Read this skill when another rapidkit-* skill tells you to.
---

## Project Architecture

- **Workspace:** uv workspace (Python) + pnpm/turborepo (TypeScript) monorepo
- **Dependency flow:** plugins -> common -> framework -> core; common also depends directly on core. `rapidkit-security` is a separate, stateless security package. Declare the packages each plugin imports directly.

```
apps/
  backend/       — FastAPI + SQLModel + plugin architecture (Python 3.14)
  frontend/      — Vue 3 + NaiveUI + UnoCSS
  admin/         — React admin application
  desktop/       — Electron
  website/       — Documentation (VitePress)

packages/
  cli/           — TypeScript CLI (citty + clack)
  core/          — Python infrastructure (rapidkit-core)
  common/        — Python shared business layer (rapidkit-common)
  framework/     — Plugin runtime, HTTP, events, scopes (rapidkit-framework)
  security/      — JWT, password hashing, RSA (rapidkit-security)
  hooks/         — TS composables
  utils/         — TS utilities
  axios/         — TS HTTP client (axios)
  alova/         — TS HTTP client (alova)
  color/         — TS color utilities
  editor/        — TS editor
  builder/       — TS builder
```

## Import Rules

- Prefer module-level imports. Defer imports only when needed to break a real initialization cycle, including router, model or service imports inside plugin `register()` and task modules. Keep exceptions narrow and explain the dependency when it is not obvious.
- Test bootstrap may initialize environment variables before importing fixtures or application modules. Avoid delayed imports merely for convenience.

**Python priority order:**

1. stdlib
2. `rapidkit_core`
3. `rapidkit_framework` / `rapidkit_security`
4. `rapidkit_common`
5. `plugin_*`
6. local (relative)

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

- Use logging helpers from `rapidkit_core.log`: plugins bind `get_plugin_logger()`, while infrastructure may import `logger`. Never use `logging.getLogger()`.
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

- Use `AppException(code_enum)` with a framework or plugin status-code enum for business errors — message is auto-translated via i18n:

  ```python
  from rapidkit_framework.exceptions import AppException
  from rapidkit_framework.status_codes import StatusCode

  from plugin_auth.status_codes import AuthStatusCode

  # Framework errors and plugin errors both carry their own i18n keys.
  raise AppException(StatusCode.RESOURCE_NOT_FOUND)
  raise AppException(AuthStatusCode.USER_NOT_FOUND)
  ```

- Status codes use six logical digits: `[plugin(2)][type(1)][sequence(3)]`. Framework codes use plugin `00`; integer values omit leading zeroes. For example, `4001` is framework `004001`, while auth's `USER_NOT_FOUND` is `015001` (integer `15001`).
- Framework `StatusCode` and plugin-specific enums inherit `BaseStatusCode` from `rapidkit_framework.status_codes`.
- `AppException` translates the enum's `description` i18n key automatically.
- When no existing code fits, define general framework errors in `packages/framework/src/rapidkit_framework/status_codes.py`; define business errors in that plugin's `status_codes.py` using its assigned plugin ID.
- Add translations under the matching namespace in `apps/backend/src/locales/langs/{zh-CN,en-US}/`: framework keys use `common.error.*`; plugin keys use e.g. `auth.error.*` or `department.error.*`.

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
| AppException              | `from rapidkit_framework.exceptions import AppException`                     |
| StatusCode                | `from rapidkit_framework.status_codes import StatusCode`                     |
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

The canonical repository-wide policy is `AGENTS.md` at the repository root. Read and follow it before any repository edit:

- A simple task (no design/plan, 1–2 files, no migration, no API or permission change) may be done on the current branch in place. Every other new task starts in a new worktree `.worktrees/<type>-<slug>` on a fresh `<type>/<slug>` branch (`feature`, `fix`, `refactor`, `perf`, `docs`, `test`, `chore`; e.g. `feature/login`), preserving existing work. A continuation of the same task stays in that worktree and branch.
- After validation, implementation changes may be committed automatically using explicit task-owned paths or hunks; exclude unrelated pre-existing changes.
- Never stage or commit design documents, specifications or implementation plans, including `docs/superpowers/specs/` and `docs/superpowers/plans/`.
- Do not push, merge or rewrite history without explicit user authorization. If branch setup is blocked, do not edit the entry branch or detached HEAD.

These rules override incompatible Git steps in generic workflow skills.

## Lean Code Rules

Solve the whole task with the least new code. Take the first option that fully works:

1. Does it need to exist? Skip features, options and flexibility nobody asked for, and name what you skipped in one line.
2. Already in this codebase (helper, component, service, CRUD, pattern)? Reuse it the way the surrounding code does.
3. Standard library or platform feature? Use it, unless the project has its own.
4. An installed dependency? Use it. Never add a dependency for a few lines.
5. One line a reader gets at a glance? One line.
6. Otherwise: the minimum code that works.

- Be lean about the solution, never about the change: finish every caller, test, fixture, export, generated type and migration the change reaches. Bug fix: grep every caller first, then fix the root cause once in the shared code.
- No abstraction, wrapper, pass-through function, type conversion, option, config, boilerplate or "for later" code nobody asked for. An interface, base class or factory needs a second real implementation. Keep values in the form the platform already gives you. Deletion beats addition.
- Keep the structure the codebase already has. Split a file or function by job, never by line count, and never into helpers that exist only to make a function shorter.
- The shortest working diff wins once you know everything it must touch. A one-liner that needs decoding is not short. Between options of equal size, take the one correct on edge cases.
- Comment only the why the code cannot show, in one line. No comments that restate the code, no changelog comments.
- Tests: one test that fails when risky logic (a branch, parser, permission check, data write, bug fix) breaks. Not coverage for its own sake.
- Never cut: validation at trust boundaries, error handling that prevents data loss, security and permission checks, accessibility, anything the user asked for. Code you move or merge keeps its validation and error handling.
- Finish the report with one or two lines: what you skipped or did not check, and any risk the user must know.

## Rules

### ALWAYS

- Prefer module-level imports; use only the initialization-cycle and test-bootstrap exceptions described above.
- Use `get_plugin_logger("<PluginName>")` in plugin code, `logger` in core code
- Use Loguru `{}` placeholders in log messages
- Include `user_id` in security logs
- Use `timezone.now()` for storing timestamps
- Use `LocalDatetime` for datetime fields in response schemas
- Use `AppException(code_enum)` with a framework or plugin status-code enum; messages auto-translate via i18n.
- Add new StatusCode + i18n translations when no existing code fits
- Return `Response[T]` from all endpoints
- Use `snake_case` -> `camelCase` alias via `BaseModel`
- Use UUID7 primary keys (provided by `SQLModel` base class)

### NEVER

- Use `logging.getLogger()` instead of the project logging helpers.
- Use f-strings or printf-style formatting in log calls
- Use `datetime.now()` or `datetime.utcnow()`
- Log passwords, tokens, or PII
- Manually prefix log messages with [PluginName] — use get_plugin_logger() instead
- Edit the task entry branch, commit design/plan artifacts, or include unrelated changes in a task commit.
- Delay imports without an actual initialization-cycle or test-bootstrap reason.
- Pass hardcoded user-facing text to AppException `message=` or `data=` — always use StatusCode i18n

### PREFER

- `BaseCRUD[Model]` subclass for DB operations over raw queries
- `SessionDep` / `RedisDep` dependency injection over manual session creation
- Enum-based StatusCode over raw integer codes
- `BaseModel` from `rapidkit_common.schemas.base` over raw Pydantic BaseModel
