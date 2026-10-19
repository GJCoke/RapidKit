---
name: rapidkit-plugin
description: Scaffold and register new backend plugins for the RapidKit project. Use this skill when the user asks to create a new plugin, add a plugin skeleton, or set up the directory structure and configuration for a new backend module. Trigger whenever the user mentions creating a plugin, new module, or plugin scaffolding.
---

# RapidKit Plugin Scaffolding

Unless explicitly described as relative to a package or source file, project paths in this skill are relative to the repository root.

## Prerequisites

Read `rapidkit-conventions` for universal rules and `rapidkit-permission` for resource/code declarations and route access. A new API plugin must satisfy both.

## Scope

This skill covers:

- Plugin directory structure and file scaffolding
- PluginManifest registration (`register()` function)
- Entry point configuration (pyproject.toml)
- Workspace and Alembic registration
- Test boilerplate

Out of scope (use other skills):

- Writing models, CRUD, schemas, API endpoints -> use `rapidkit-backend-design`
- Database migrations -> use `rapidkit-migration`
- Celery tasks -> use `rapidkit-celery-task`

## Directory Layout

Every plugin lives under `apps/backend/plugins/<name>/` with this structure:

```
plugins/<name>/
├── pyproject.toml                        # Package metadata + entry point
├── src/plugin_<name>/
│   ├── __init__.py                       # register() -> PluginManifest
│   ├── permissions.py                    # Resource and permission-code declarations
│   ├── models.py                         # SQLModel ORM table classes
│   ├── schemas.py                        # Pydantic request/response schemas
│   ├── crud.py                           # BaseCRUD subclass
│   ├── services.py                       # Business logic layer
│   ├── api.py                            # FastAPI router with endpoints
│   └── deps.py                           # Annotated dependency injection types
├── migrations/
│   ├── __init__.py
│   └── versions/
│       └── __init__.py
└── tests/
    ├── __init__.py
    ├── conftest.py
    └── test_register.py
```

For plugins with multiple subdomains, split the domain files into subdirectories under `src/plugin_<name>/`. For example, `permission` owns `role/` and `router/`; `auth` owns `auth/`, `invite/`, `password_reset/` and `impersonation/`. Registration and shared permission declarations stay at plugin root.

## Core Patterns

### 1. The `register()` Function

Every plugin's `src/plugin_<name>/__init__.py` must export a `register()` function returning a `PluginManifest`:

```python
from rapidkit_framework.plugin import PluginManifest

from plugin_<name>.permissions import PERMISSION_CODES, PERMISSION_PACKAGES, RESOURCES


def register() -> PluginManifest:
    from plugin_<name>.api import router
    from plugin_<name>.models import MyModel

    return PluginManifest(
        name="<name>",
        version="0.1.0",
        router=router,
        models=[MyModel],
        resources=RESOURCES,
        permission_codes=PERMISSION_CODES,
        permission_packages=PERMISSION_PACKAGES,
    )
```

Key points:

- Follow `rapidkit-conventions` import exceptions. Router and model imports may remain inside `register()` to break initialization cycles; `permissions.py` may import models at module level when safe.
- `models` list must include all SQLModel table classes so Alembic can discover them for autogenerate
- `name` must match the plugin directory name

### 2. PluginManifest Optional Fields

```python
PluginManifest(
    name="<name>",
    version="0.1.0",
    router=router,
    models=[Model1, Model2],
    # Optional:
    dependencies=["auth", "menu"],          # Plugins that must load before this one
    event_listeners=[(MyEvent, on_my_event)], # (EventType, handler), optional third priority
    on_startup=[startup_callback],          # Async callbacks run at app startup
    on_shutdown=[shutdown_callback],        # Async callbacks run at app shutdown
    dependency_overrides={                  # Override FastAPI dependencies
        get_current_user: real_get_current_user,
    },
)
```

### 3. pyproject.toml Template

```toml
[project]
name = "rapidkit-plugin-<name>"
version = "0.1.0"
description = "<Plugin description>"
requires-python = ">=3.14"
dependencies = [
    "rapidkit-core",
    "rapidkit-common",
    "rapidkit-framework",
]

[project.entry-points."rapidkit.plugins"]
<name> = "plugin_<name>:register"

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.hatch.build.targets.wheel]
packages = ["src/plugin_<name>"]

[tool.pytest.ini_options]
asyncio_mode = "strict"
asyncio_default_fixture_loop_scope = "function"
```

The `[project.entry-points."rapidkit.plugins"]` section is critical -- this is how the plugin loader discovers plugins via `importlib.metadata.entry_points(group="rapidkit.plugins")`.

### 4. Test Boilerplate

`tests/conftest.py`:

```python
import os

os.environ.setdefault("RAPIDKIT_ENV", "test")

from tests.testing.fixtures import *  # noqa: E402, F401, F403
```

`tests/test_register.py` -- standard registration test that verifies the manifest name, version, router presence, and model list.

## Step-by-Step: Create a New Plugin

### Step 1: Scaffold Directory and Files

Create all directories and files listed in the Directory Layout section above. Populate with minimal content:

- `__init__.py` files in `migrations/` and `tests/` are empty
- `models.py`, `schemas.py`, `crud.py`, `services.py`, `api.py`, `deps.py` start with file header and minimal imports

### Step 2: Write pyproject.toml

Use the template from section 3 above. Add any plugin-specific dependencies beyond core/common.

### Step 3: Register in Workspace

Add the plugin package to **two** dependency lists:

**Root `pyproject.toml`**:

```toml
[project]
dependencies = [
    # ... existing ...
    "rapidkit-plugin-<name>",
]

[tool.uv.sources]
# ... existing ...
rapidkit-plugin-<name> = { workspace = true }
```

**Backend `apps/backend/pyproject.toml`**:

```toml
[project]
dependencies = [
    # ... existing ...
    "rapidkit-plugin-<name>",
]

[tool.uv.sources]
# ... existing ...
rapidkit-plugin-<name> = { workspace = true }
```

Note: The workspace `members` glob `apps/backend/plugins/*` in the root pyproject.toml already covers new plugins automatically.

### Step 4: Register in Alembic

The plugin's own `[project.entry-points."rapidkit.plugins"]` declaration is used by `apps/backend/scripts/alembic/plugin_discovery.py`. `apps/backend/alembic/env.py` calls `discover_migration_plugins(Path("plugins"))`; do not add manual module imports to `env.py`.

The CLI's `syncAlembicConfig()` adds local plugin migration paths to `alembic.ini`. `pnpm rapidkit plugin create` and the database commands call it automatically. Preserve the entry point, manifest model list and `migrations/versions/` directory so discovery can map tables to the plugin.

### Step 5: Install and Verify

```bash
uv sync
```

### Step 6: Generate Initial Migration

After writing models, generate the first migration:

```bash
pnpm rapidkit db migrate --plugin <name> -m "init"
pnpm rapidkit db upgrade --plugin <name>
```

The first migration automatically uses `--branch-label=<name> --head=base` to create an independent Alembic branch.

## Optional: plugins.toml

If the plugin needs conditional enabling/disabling, add an entry to `apps/backend/plugins.toml`:

```toml
[plugins.<name>]
enabled = "${ENV_VAR:default}"
```

Plugins NOT listed here are enabled by default.

## Rules

- Follow shared import rules: defer router/model/service imports only for real initialization cycles; permission declarations and their model imports may be at module top.
- ALWAYS use `plugin_<name>` as the Python package name (with underscore)
- ALWAYS use `rapidkit-plugin-<name>` as the pyproject.toml package name (with hyphens)
- Register the package dependency in both root and backend pyproject.toml; declare the plugin entry point in its own pyproject.toml.
- Declare resources/codes in `permissions.py`, wire them into the manifest, and give every API route one access declaration (`rapidkit-permission`).
- ALWAYS create `migrations/versions/__init__.py` even if no migrations exist yet
- ALWAYS prefix table names with the plugin name (e.g., `auth_users`, `worker_task_results`)
- NEVER add cross-plugin imports in model files -- use event_listeners for cross-plugin communication
