---
name: rapidkit-migration
description: Create and manage database migrations for the RapidKit project. Use this skill when the user asks to generate migrations, upgrade/downgrade the database, check migration status, or reset migrations. Trigger whenever the user mentions Alembic, database migration, schema changes, upgrade, downgrade, or migration status.
---

# RapidKit Database Migration

## Prerequisites

Read `rapidkit-conventions` skill first for universal project rules.

## Scope

This skill covers:

- Alembic multi-branch migration architecture
- Generating new migrations (single-plugin and multi-plugin)
- Upgrade, downgrade, and status commands
- Migration reset workflow

Out of scope (use other skills):

- Creating a new plugin -> use `rapidkit-plugin`
- Writing SQLModel models -> use `rapidkit-backend-design`

## Architecture

RapidKit uses Alembic with a **multi-branch strategy** -- each plugin maintains its own independent migration chain, all sharing a single database and configuration.

### Key Files

| File                                               | Role                                                    |
| -------------------------------------------------- | ------------------------------------------------------- |
| `apps/backend/alembic.ini`                         | Central config with multi-directory `version_locations` |
| `apps/backend/alembic/env.py`                      | Plugin model discovery + async migration runner         |
| `apps/backend/scripts/alembic/detect_changes.py`   | Python probe that diffs metadata vs DB per-plugin       |
| `apps/backend/plugins/<name>/migrations/versions/` | Per-plugin migration files                              |

### How It Works

- `alembic.ini` defines `version_locations` as a colon-separated list of all plugin migration directories
- `env.py` has a `PLUGIN_MODULES` list that imports each plugin and calls `register()` to trigger model registration onto `SQLModel.metadata`
- Each plugin's first migration uses `branch_labels = ('<plugin_name>',)` to create a named Alembic branch
- Subsequent migrations in the same plugin chain via `down_revision` pointing to the previous revision

## CLI Commands

All migration operations are done through the `flux` CLI:

| Command                                       | Purpose                                                     |
| --------------------------------------------- | ----------------------------------------------------------- |
| `flux db migrate`                             | Generate new migration files (auto-detects changed plugins) |
| `flux db migrate --plugin <name> -m "msg"`    | Generate migration for a specific plugin                    |
| `flux db upgrade`                             | Apply all pending migrations (`alembic upgrade heads`)      |
| `flux db upgrade --plugin <name>`             | Apply migrations for a specific plugin                      |
| `flux db downgrade --plugin <name>`           | Roll back one migration for a plugin                        |
| `flux db downgrade --plugin <name> --steps N` | Roll back N migrations                                      |
| `flux db status`                              | Show per-plugin migration status table                      |
| `flux db reset`                               | Drop schema, regenerate all, re-seed (destructive)          |
| `flux db clean`                               | Delete migration `.py` files (preserves `__init__.py`)      |

## Step-by-Step Operations

### Operation 1: Add a New Table to an Existing Plugin

1. Add or modify SQLModel table classes in the plugin's `models.py`
2. Ensure the model is included in `register()` -> `models=[...]` list
3. Generate migration:
   ```bash
   flux db migrate --plugin <name> -m "add user_preferences table"
   ```
4. Review the generated migration file in `plugins/<name>/migrations/versions/`
5. Apply:
   ```bash
   flux db upgrade --plugin <name>
   ```

### Operation 2: Auto-Detect Changes Across All Plugins

1. Run without `--plugin` flag:
   ```bash
   flux db migrate
   ```
2. The CLI runs `detect_changes.py` which:
   - Loads all plugins and builds a `table_name -> plugin_name` mapping
   - Compares `SQLModel.metadata` against the live database
   - Reports per-plugin status: `"initial"`, `"changed"`, or `"up_to_date"`
3. Select which plugins to generate migrations for (interactive prompt)
4. Apply all:
   ```bash
   flux db upgrade
   ```

### Operation 3: Roll Back a Migration

```bash
flux db downgrade --plugin <name>           # roll back 1 step
flux db downgrade --plugin <name> --steps 3 # roll back 3 steps
```

### Operation 4: Check Current Status

```bash
flux db status
```

Shows a table with each plugin's current revision, head revision, and whether it is up to date or has pending migrations.

### Operation 5: Full Reset (Destructive)

```bash
flux db reset
```

This will:

1. Delete all migration `.py` files across all plugins
2. Drop and recreate the `public` schema
3. Re-detect all changes and generate fresh `init` migrations
4. Run `alembic upgrade heads`
5. Optionally seed with `python src/initdb.py`

## Migration File Pattern

```python
"""add user_preferences table

Revision ID: abc123def456
Revises:
Create Date: 2025-01-15 10:30:00.000000
"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
import sqlmodel
from alembic import op

revision: str = "abc123def456"
down_revision: Union[str, None] = None        # None for first migration
branch_labels: Union[str, Sequence[str], None] = ("<name>",)  # Only on first migration
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "<name>_user_preferences",
        sa.Column("id", sa.Integer(), nullable=False),
        # ...
    )


def downgrade() -> None:
    op.drop_table("<name>_user_preferences")
```

Key points:

- `branch_labels` is set ONLY on the first revision to the plugin name
- `down_revision = None` on the first revision (independent chain)
- Subsequent revisions have `down_revision` pointing to the previous revision and `branch_labels = None`
- Table names are prefixed with the plugin name

## Rules

- ALWAYS use `flux db migrate` instead of raw `alembic` commands -- the CLI handles config syncing
- ALWAYS review auto-generated migration files before applying -- autogenerate can miss or misinterpret changes
- ALWAYS prefix table names with the plugin name to avoid cross-plugin collisions
- NEVER manually edit `version_locations` in `alembic.ini` or `PLUGIN_MODULES` in `env.py` -- the CLI's `syncAlembicConfig()` manages these
- NEVER delete migration files that have been applied to shared databases -- use downgrade instead
- PREFER `flux db reset` only in development -- never in production
