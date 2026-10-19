---
name: rapidkit-migration
description: Create and manage database migrations for the RapidKit project. Use this skill when the user asks to generate migrations, upgrade/downgrade the database, check migration status, or reset migrations. Trigger whenever the user mentions Alembic, database migration, schema changes, upgrade, downgrade, or migration status.
---

# RapidKit Database Migration

Unless explicitly described as relative to a package or source file, project paths in this skill are relative to the repository root.

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
- `env.py` calls `discover_migration_plugins(Path("plugins"))` from `apps/backend/scripts/alembic/plugin_discovery.py`; entry points and plugin manifests determine model/table ownership. Do not maintain a manual plugin module list.
- Each plugin's first migration uses `branch_labels = ('<plugin_name>',)` to create a named Alembic branch
- Subsequent migrations in the same plugin chain via `down_revision` pointing to the previous revision

## CLI Commands

All migration operations are done through the `pnpm rapidkit` CLI:

| Command                                       | Purpose                                                     |
| --------------------------------------------- | ----------------------------------------------------------- |
| `pnpm rapidkit db migrate`                             | Detect changes, stamp existing heads, then generate AND upgrade each selected plugin |
| `pnpm rapidkit db migrate --plugin <name> -m "msg"`    | Generate migration for a specific plugin                    |
| `pnpm rapidkit db upgrade`                             | Apply all pending migrations (`alembic upgrade heads`)      |
| `pnpm rapidkit db upgrade --plugin <name>`             | Apply migrations for a specific plugin                      |
| `pnpm rapidkit db downgrade --plugin <name>`           | Roll back one migration for a plugin                        |
| `pnpm rapidkit db downgrade --plugin <name> --steps N` | Roll back N migrations                                      |
| `pnpm rapidkit db status`                              | Show per-plugin migration status table                      |
| `pnpm rapidkit db reset`                               | Drop schema, regenerate all, re-seed (destructive)          |
| `pnpm rapidkit db clean`                               | Delete migration `.py` files (preserves `__init__.py`)      |

## Step-by-Step Operations

### Operation 1: Add a New Table to an Existing Plugin

1. Add or modify SQLModel table classes in the plugin's `models.py`
2. Ensure the model is included in `register()` -> `models=[...]` list
3. Generate migration:
   ```bash
   pnpm rapidkit db migrate --plugin <name> -m "add user_preferences table"
   ```
4. Review the generated migration file in `plugins/<name>/migrations/versions/`
5. Apply:
   ```bash
   pnpm rapidkit db upgrade --plugin <name>
   ```

### Operation 2: Generate and Apply Across Multiple Plugins

1. Run without `--plugin` flag:
   ```bash
   pnpm rapidkit db migrate
   ```
2. The CLI runs `detect_changes.py` which:
   - Loads all plugins and builds a `table_name -> plugin_name` mapping
   - Compares `SQLModel.metadata` against the live database
   - Reports per-plugin status: `"initial"`, `"changed"`, or `"up_to_date"`
3. Supply a message and select plugins in the interactive prompt, or use `pnpm rapidkit db migrate --all -m "message"`.
4. `generateForPlugins()` stamps existing heads, generates each selected revision, and immediately upgrades that plugin. This mode writes to the database; there is no generated-file review pause before upgrade.
5. If migrations must be reviewed before application, use `--plugin <name>` separately as in Operation 1. Single-plugin mode generates a revision without upgrading.

### Operation 3: Roll Back a Migration

```bash
pnpm rapidkit db downgrade --plugin <name>           # roll back 1 step
pnpm rapidkit db downgrade --plugin <name> --steps 3 # roll back 3 steps
```

### Operation 4: Check Current Status

```bash
pnpm rapidkit db status
```

Shows a table with each plugin's current revision, head revision, and whether it is up to date or has pending migrations.

### Operation 5: Full Reset (Destructive)

```bash
pnpm rapidkit db reset
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
from alembic import op

revision: str = "abc123def456"
down_revision: Union[str, None] = None        # None for first migration
branch_labels: Union[str, Sequence[str], None] = ("<name>",)  # Only on first migration
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "<name>_user_preferences",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_by", sa.Uuid(), nullable=True),
        sa.Column("create_time", sa.DateTime(), nullable=False),
        sa.Column("update_time", sa.DateTime(), nullable=False),
        # Add resource-specific columns from the model.
        sa.PrimaryKeyConstraint("id"),
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

- ALWAYS use `pnpm rapidkit db migrate` instead of raw `alembic` commands -- the CLI handles config syncing
- When review-before-apply is required, generate with `--plugin <name>`, review the file, then run upgrade. Multi-plugin generation applies revisions immediately; autogenerate can miss or misinterpret changes.
- ALWAYS prefix table names with the plugin name to avoid cross-plugin collisions
- Let the CLI sync `version_locations` in `alembic.ini`; Alembic discovers plugin models through entry points and manifests, not a manually maintained import list in `env.py`.
- NEVER delete migration files that have been applied to shared databases -- use downgrade instead
- PREFER `pnpm rapidkit db reset` only in development -- never in production
