"""
Per-plugin model change detection probe.

Usage: uv run python scripts/alembic/detect_changes.py
Output: JSON to stdout with per-plugin change details.
"""

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
from scripts.alembic.plugin_discovery import discover_migration_plugins  # noqa: E402
from sqlalchemy import create_engine  # noqa: E402
from sqlmodel import SQLModel  # noqa: E402

# ---------------------------------------------------------------------------
# 1. Load all plugins and build table → plugin mapping
# ---------------------------------------------------------------------------
discovery = discover_migration_plugins(Path("plugins"))
table_to_plugin = discovery.table_to_plugin
plugin_info: dict[str, dict] = {}

for descriptor in discovery.plugins.values():
    if descriptor.external:
        continue
    versions_dir = Path(descriptor.version_path or "")
    has_migrations = any(
        file.suffix == ".py" and file.name != "__init__.py"
        for file in versions_dir.iterdir()
    )
    plugin_info[descriptor.name] = {
        "name": descriptor.name,
        "directoryName": descriptor.directory_name,
        "module": descriptor.module,
        "versionPath": descriptor.version_path,
        "tables": list(descriptor.tables),
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
            "directoryName": info["directoryName"],
            "module": info["module"],
            "versionPath": info["versionPath"],
            "status": status,
            "hasMigrations": info["hasMigrations"],
            "changes": info["changes"],
        }
    )

output = {"plugins": result, "errors": []}

if unassigned:
    output["unassigned"] = unassigned

print(json.dumps(output, ensure_ascii=False))
