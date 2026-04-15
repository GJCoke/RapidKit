"""
Per-plugin model change detection probe.

Usage: uv run python scripts/alembic/detect_changes.py
Output: JSON to stdout with per-plugin change details.
"""

from __future__ import annotations

import importlib
import json
import logging
import os
from pathlib import Path

# Suppress noisy logs — only output JSON to stdout
logging.disable(logging.CRITICAL)
os.environ.setdefault("SQLALCHEMY_WARN_20", "0")

from alembic.autogenerate import compare_metadata  # noqa: E402
from alembic.migration import MigrationContext  # noqa: E402
from rapidkit_core.config import settings  # noqa: E402
from sqlalchemy import create_engine  # noqa: E402
from sqlmodel import SQLModel  # noqa: E402

# ---------------------------------------------------------------------------
# 1. Load all plugins and build table → plugin mapping
# ---------------------------------------------------------------------------
PLUGIN_MODULES: list[str] = [
    "plugin_auth",
    "plugin_script",
    "plugin_monitoring",
    "plugin_system",
    "plugin_menu",
    "plugin_worker",
    "plugin_schedule",
    "plugin_user",
]

table_to_plugin: dict[str, str] = {}
plugin_info: dict[str, dict] = {}

for mod_name in PLUGIN_MODULES:
    # Derive plugin name: "plugin_auth" → "auth"
    name = mod_name.removeprefix("plugin_")

    try:
        mod = importlib.import_module(mod_name)
        manifest = mod.register()
    except Exception:
        continue

    tables: list[str] = []
    for model_cls in manifest.models:
        tname = getattr(model_cls, "__tablename__", None)
        if tname:
            table_to_plugin[tname] = name
            tables.append(tname)

    # Check if plugin has existing migration files
    versions_dir = Path("plugins") / name / "migrations" / "versions"
    has_migrations = False
    if versions_dir.exists():
        has_migrations = any(f.suffix == ".py" and f.name != "__init__.py" for f in versions_dir.iterdir())

    plugin_info[name] = {
        "name": name,
        "tables": tables,
        "hasMigrations": has_migrations,
        "changes": [],
    }

# ---------------------------------------------------------------------------
# 2. Compare metadata against database schema
# ---------------------------------------------------------------------------
db_url = str(settings.ASYNC_DATABASE_POSTGRESQL_URL).replace("+asyncpg", "+psycopg")
engine = create_engine(db_url)

try:
    with engine.connect() as conn:
        migration_ctx = MigrationContext.configure(
            conn,
            opts={"compare_type": True, "compare_server_default": True},
        )
        diffs = compare_metadata(migration_ctx, SQLModel.metadata)
finally:
    engine.dispose()

# ---------------------------------------------------------------------------
# 3. Classify diffs by plugin
# ---------------------------------------------------------------------------
unassigned: list[dict] = []

for diff_op in diffs:
    change: dict | None = None
    table_name: str | None = None

    if isinstance(diff_op, tuple):
        op_type = diff_op[0]

        if op_type == "add_table":
            table_obj = diff_op[1]
            table_name = table_obj.name
            change = {"type": "add_table", "table": table_name, "detail": f"table '{table_name}'"}

        elif op_type == "remove_table":
            table_obj = diff_op[1]
            table_name = table_obj.name
            change = {"type": "remove_table", "table": table_name, "detail": f"table '{table_name}'"}

        elif op_type in ("add_column", "remove_column"):
            _schema = diff_op[1]
            table_name = diff_op[2]
            col = diff_op[3]
            col_name = col.name if hasattr(col, "name") else str(col)
            change = {"type": op_type, "table": table_name, "detail": f"column '{col_name}'"}

        elif op_type in ("modify_type", "modify_nullable", "modify_default", "modify_comment"):
            _schema = diff_op[1]
            table_name = diff_op[2]
            col_name = diff_op[3]
            change = {"type": op_type, "table": table_name, "detail": f"column '{col_name}'"}

        elif op_type in ("add_index", "remove_index"):
            idx = diff_op[1]
            table_name = idx.table.name if idx.table is not None else None
            idx_name = idx.name or "unnamed"
            change = {"type": op_type, "table": table_name or "unknown", "detail": f"index '{idx_name}'"}

        elif op_type in ("add_constraint", "remove_constraint"):
            constraint = diff_op[1]
            table_name = (
                constraint.table.name if hasattr(constraint, "table") and constraint.table is not None else None
            )
            change = {"type": op_type, "table": table_name or "unknown", "detail": str(constraint.name or "unnamed")}

    # Handle nested tuple ops like [('add_index', ...)]
    elif isinstance(diff_op, list):
        for sub_op in diff_op:
            if isinstance(sub_op, tuple) and len(sub_op) >= 2:
                op_type = sub_op[0]
                if op_type in ("add_index", "remove_index"):
                    idx = sub_op[1]
                    t = idx.table.name if idx.table is not None else None
                    c = {"type": op_type, "table": t or "unknown", "detail": f"index '{idx.name}'"}
                    if t and t in table_to_plugin:
                        pname = table_to_plugin[t]
                        plugin_info[pname]["changes"].append(c)
                    else:
                        unassigned.append(c)
        continue

    if change is None:
        continue

    if table_name and table_name in table_to_plugin:
        pname = table_to_plugin[table_name]
        plugin_info[pname]["changes"].append(change)
    else:
        unassigned.append(change)

# ---------------------------------------------------------------------------
# 4. Determine status for each plugin
# ---------------------------------------------------------------------------
result: list[dict] = []

for info in plugin_info.values():
    has_models = len(info["tables"]) > 0
    has_changes = len(info["changes"]) > 0

    if not info["hasMigrations"] and has_models:
        status = "initial"
    elif has_changes:
        status = "changed"
    else:
        status = "up_to_date"

    result.append(
        {
            "name": info["name"],
            "status": status,
            "hasMigrations": info["hasMigrations"],
            "changes": info["changes"],
        }
    )

output = {"plugins": result}

if unassigned:
    output["unassigned"] = unassigned

print(json.dumps(output, ensure_ascii=False))
