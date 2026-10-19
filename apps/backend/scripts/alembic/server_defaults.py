"""Compare PostgreSQL JSON defaults through JSONB, which supports semantic equality."""

from typing import Any

from alembic.migration import MigrationContext
from sqlalchemy import JSON, Column, cast, literal, literal_column, select
from sqlalchemy.dialects.postgresql import JSONB


def compare_json_server_defaults(
    context: MigrationContext,
    inspected_column: Column[Any],
    metadata_column: Column[Any],
    inspected_default: str | None,
    metadata_default: Any,
    rendered_metadata_default: str | None,
) -> bool | None:
    """Handle JSON defaults; let Alembic compare every other column normally."""
    if context.dialect.name != "postgresql" or not (
        isinstance(inspected_column.type, JSON) and isinstance(metadata_column.type, JSON)
    ):
        return None
    if inspected_default is None or rendered_metadata_default is None:
        return inspected_default != rendered_metadata_default
    if context.connection is None:
        return None
    reflected = literal_column(inspected_default)
    desired = metadata_default.arg
    if isinstance(desired, str):
        desired = literal(desired)
    comparison = select(cast(reflected, JSONB).is_distinct_from(cast(desired, JSONB)))
    return bool(context.connection.scalar(comparison))
