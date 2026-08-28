"""PostgreSQL enum value change detection for Alembic autogeneration."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from alembic.autogenerate import renderers
from alembic.operations.ops import MigrateOperation, UpgradeOps
from sqlalchemy import Enum, MetaData

EnumKey = tuple[str | None, str]


@dataclass(frozen=True)
class ModelEnum:
    """A named enum declared by SQLAlchemy metadata."""

    schema: str | None
    name: str
    values: tuple[str, ...]
    owner: str


@dataclass(frozen=True)
class EnumValueChange:
    """One PostgreSQL enum value that needs to be added."""

    schema: str | None
    name: str
    value: str
    owner: str
    before: str | None = None


class AddEnumValueOp(MigrateOperation):
    """Reversible Alembic wrapper for a PostgreSQL enum addition."""

    def __init__(self, change: EnumValueChange) -> None:
        self.change = change

    @property
    def sqltext(self) -> str:
        return render_add_enum_value_sql(self.change)

    def reverse(self) -> MigrateOperation:
        return EnumValueDowngradeNoop(self.change)


class EnumValueDowngradeNoop(MigrateOperation):
    """Safe downgrade marker because PostgreSQL cannot drop enum values."""

    def __init__(self, change: EnumValueChange) -> None:
        self.change = change

    def reverse(self) -> MigrateOperation:
        return AddEnumValueOp(self.change)


@renderers.dispatch_for(AddEnumValueOp)
def _render_add_enum_value(_context: object, operation: AddEnumValueOp) -> str:
    return f"op.execute({operation.sqltext!r})"


@renderers.dispatch_for(EnumValueDowngradeNoop)
def _render_enum_value_downgrade(
    _context: object,
    operation: EnumValueDowngradeNoop,
) -> str:
    return f"pass  # PostgreSQL enum value {operation.change.value!r} is not removed automatically"


EnumInspector = Any


def collect_model_enums(
    metadata: MetaData,
    table_to_plugin: dict[str, str],
) -> dict[EnumKey, ModelEnum]:
    """Collect named enums and assign each to one deterministic plugin."""
    values_by_key: dict[EnumKey, tuple[str, ...]] = {}
    plugins_by_key: dict[EnumKey, set[str]] = {}

    for table in metadata.tables.values():
        plugin = table_to_plugin.get(table.name)
        if plugin is None:
            continue
        for column in table.columns:
            column_type = column.type
            if not isinstance(column_type, Enum) or column_type.name is None:
                continue
            key = (column_type.schema or table.schema, column_type.name)
            values = tuple(column_type.enums)
            previous_values = values_by_key.setdefault(key, values)
            if previous_values != values:
                qualified_name = ".".join(part for part in key if part is not None)
                raise ValueError(f"enum {qualified_name} has conflicting values: {previous_values} != {values}")
            plugins_by_key.setdefault(key, set()).add(plugin)

    return {
        key: ModelEnum(
            schema=key[0],
            name=key[1],
            values=values,
            owner=min(plugins_by_key[key]),
        )
        for key, values in values_by_key.items()
    }


def compare_enum_values(
    definitions: dict[EnumKey, ModelEnum],
    database_enums: dict[EnumKey, tuple[str, ...]],
) -> tuple[list[EnumValueChange], list[str]]:
    """Return safe enum additions and errors for destructive changes."""
    changes: list[EnumValueChange] = []
    errors: list[str] = []

    for key, definition in sorted(definitions.items(), key=lambda item: str(item[0])):
        database_values = database_enums.get(key)
        if database_values is None:
            continue

        model_values = definition.values
        model_set = set(model_values)
        database_set = set(database_values)
        removed = [value for value in database_values if value not in model_set]
        reordered = tuple(value for value in model_values if value in database_set) != tuple(
            value for value in database_values if value in model_set
        )

        if removed or reordered:
            reasons: list[str] = []
            if removed:
                reasons.append(f"removed values: {', '.join(removed)}")
            if reordered:
                reasons.append("reordered existing values")
            qualified_name = ".".join(part for part in key if part is not None)
            errors.append(f"enum {qualified_name} requires a manual migration ({'; '.join(reasons)})")
            continue

        for index, value in enumerate(model_values):
            if value in database_set:
                continue
            before = next(
                (candidate for candidate in model_values[index + 1 :] if candidate in database_set),
                None,
            )
            changes.append(
                EnumValueChange(
                    schema=definition.schema,
                    name=definition.name,
                    value=value,
                    owner=definition.owner,
                    before=before,
                )
            )

    return changes, errors


def load_database_enums(inspector: EnumInspector) -> dict[EnumKey, tuple[str, ...]]:
    """Read PostgreSQL enums and normalize the default schema to ``None``."""
    result: dict[EnumKey, tuple[str, ...]] = {}
    for item in inspector.get_enums(schema="*"):
        schema = item.get("schema")
        normalized_schema = None if schema in (None, inspector.default_schema_name) else str(schema)
        name = str(item["name"])
        labels = tuple(str(label) for label in item["labels"])
        result[(normalized_schema, name)] = labels
    return result


def append_enum_value_ops(
    upgrade_ops: UpgradeOps,
    changes: list[EnumValueChange],
    plugin_name: str,
) -> None:
    """Append enum additions owned by ``plugin_name`` to Alembic operations."""
    for change in changes:
        if change.owner == plugin_name:
            upgrade_ops.ops.append(AddEnumValueOp(change))


def autogenerate_enum_value_ops(
    *,
    metadata: MetaData,
    table_to_plugin: dict[str, str],
    inspector: EnumInspector,
    upgrade_ops: UpgradeOps,
    plugin_name: str,
) -> None:
    """Detect and append safe PostgreSQL enum additions for one plugin."""
    definitions = collect_model_enums(metadata, table_to_plugin)
    changes, errors = compare_enum_values(
        definitions,
        load_database_enums(inspector),
    )
    if errors:
        raise ValueError("; ".join(errors))
    append_enum_value_ops(upgrade_ops, changes, plugin_name)


def render_add_enum_value_sql(change: EnumValueChange) -> str:
    """Render a safely quoted PostgreSQL ALTER TYPE statement."""
    identifier = _quote_identifier(change.name)
    if change.schema is not None:
        identifier = f"{_quote_identifier(change.schema)}.{identifier}"
    statement = f"ALTER TYPE {identifier} ADD VALUE IF NOT EXISTS {_quote_literal(change.value)}"
    if change.before is not None:
        statement += f" BEFORE {_quote_literal(change.before)}"
    return statement


def _quote_identifier(value: str) -> str:
    return f'"{value.replace(chr(34), chr(34) * 2)}"'


def _quote_literal(value: str) -> str:
    return f"'{value.replace(chr(39), chr(39) * 2)}'"
