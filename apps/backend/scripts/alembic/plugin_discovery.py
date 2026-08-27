"""Dynamic plugin descriptors and SQLModel table ownership for migrations."""

from __future__ import annotations

import importlib.metadata
import tomllib
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

from sqlalchemy import Enum, MetaData


class PluginDiscoveryError(RuntimeError):
    """A local plugin cannot be used safely for migration generation."""


@dataclass(frozen=True)
class PluginMigrationDescriptor:
    name: str
    directory_name: str | None
    module: str
    version_path: str | None
    tables: tuple[str, ...]
    external: bool = False


@dataclass(frozen=True)
class PluginDiscoveryResult:
    plugins: dict[str, PluginMigrationDescriptor]
    table_to_plugin: dict[str, str]


def enum_type_owners(
    metadata: MetaData, table_to_plugin: dict[str, str]
) -> dict[str, str]:
    """Assign every cross-plugin PostgreSQL enum to one deterministic plugin."""
    enum_plugins: dict[str, set[str]] = {}
    enum_values: dict[str, tuple[str, ...]] = {}
    for table in metadata.tables.values():
        plugin = table_to_plugin.get(table.name)
        if plugin is None:
            continue
        for column in table.columns:
            column_type = column.type
            if not isinstance(column_type, Enum) or column_type.name is None:
                continue
            values = tuple(column_type.enums)
            previous_values = enum_values.setdefault(column_type.name, values)
            if previous_values != values:
                raise PluginDiscoveryError(
                    f"enum {column_type.name} has conflicting values: "
                    f"{previous_values} != {values}"
                )
            enum_plugins.setdefault(column_type.name, set()).add(plugin)
    return {
        enum_name: min(plugins)
        for enum_name, plugins in enum_plugins.items()
        if len(plugins) > 1
    }


def object_belongs_to_plugin(
    obj: object,
    object_type: str,
    plugin_name: str,
    table_to_plugin: dict[str, str],
) -> bool:
    """Return whether an Alembic schema object belongs to a plugin table."""
    if object_type == "table":
        table_name = getattr(obj, "name", None)
    else:
        table_name = getattr(getattr(obj, "table", None), "name", None)
    return isinstance(table_name, str) and table_to_plugin.get(table_name) == plugin_name


def _local_entry_points(plugins_root: Path) -> dict[str, tuple[str, str]]:
    result: dict[str, tuple[str, str]] = {}
    if not plugins_root.exists():
        return result
    for plugin_dir in sorted(path for path in plugins_root.iterdir() if path.is_dir()):
        config_path = plugin_dir / "pyproject.toml"
        if not config_path.exists():
            continue
        config = tomllib.loads(config_path.read_text(encoding="utf-8"))
        entries = config.get("project", {}).get("entry-points", {}).get("rapidkit.plugins", {})
        for name, value in entries.items():
            if name in result:
                raise PluginDiscoveryError(f"duplicate local plugin entry point: {name}")
            result[name] = (plugin_dir.name, value)
    return result


def discover_migration_plugins(
    plugins_root: Path,
    *,
    entry_points: Iterable[importlib.metadata.EntryPoint] | None = None,
    table_overrides: dict[str, list[str]] | None = None,
) -> PluginDiscoveryResult:
    """Discover installed plugins and validate local migration ownership."""
    local = _local_entry_points(plugins_root)
    installed = {
        entry.name: entry
        for entry in (
            entry_points
            if entry_points is not None
            else importlib.metadata.entry_points(group="rapidkit.plugins")
        )
    }
    plugins: dict[str, PluginMigrationDescriptor] = {}
    ownership: dict[str, str] = {}

    for name, (directory_name, declared_value) in sorted(local.items()):
        entry = installed.get(name)
        if entry is None:
            raise PluginDiscoveryError(f"local plugin entry point is not installed: {name}")
        if entry.value != declared_value:
            raise PluginDiscoveryError(
                f"installed entry point differs from local plugin {name}: {entry.value} != {declared_value}"
            )
        try:
            manifest = entry.load()()
        except Exception as error:
            raise PluginDiscoveryError(f"failed to load local plugin {name}: {error}") from error
        if manifest.name != name:
            raise PluginDiscoveryError(
                f"plugin manifest name mismatch: entry point {name}, manifest {manifest.name}"
            )
        versions_dir = plugins_root / directory_name / "migrations" / "versions"
        if not versions_dir.is_dir():
            raise PluginDiscoveryError(f"local plugin has no migration directory: {name}")
        module = declared_value.partition(":")[0]
        tables = tuple(
            table_overrides.get(name, [])
            if table_overrides is not None and name in table_overrides
            else sorted(
                table_name
                for model in manifest.models
                if (table_name := getattr(model, "__tablename__", None))
            )
        )
        descriptor = PluginMigrationDescriptor(
            name=name,
            directory_name=directory_name,
            module=module,
            version_path=f"plugins/{directory_name}/migrations/versions",
            tables=tables,
        )
        plugins[name] = descriptor
        for table in tables:
            previous = ownership.get(table)
            if previous is not None and previous != name:
                raise PluginDiscoveryError(
                    f"table {table} is owned by multiple plugins: {previous}, {name}"
                )
            ownership[table] = name

    for name, entry in sorted(installed.items()):
        if name in plugins:
            continue
        plugins[name] = PluginMigrationDescriptor(
            name=name,
            directory_name=None,
            module=entry.value.partition(":")[0],
            version_path=None,
            tables=(),
            external=True,
        )

    return PluginDiscoveryResult(plugins=plugins, table_to_plugin=ownership)
