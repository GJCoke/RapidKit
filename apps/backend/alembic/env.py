import asyncio
from logging.config import fileConfig
from pathlib import Path

from alembic import context  # type: ignore
from alembic.autogenerate import comparators
from rapidkit_core.config import settings
from scripts.alembic.enum_changes import autogenerate_enum_value_ops
from scripts.alembic.plugin_discovery import (
    PluginDiscoveryError,
    discover_migration_plugins,
    enum_type_owners,
    object_belongs_to_plugin,
)
from sqlalchemy import inspect
from sqlalchemy.engine.base import Connection
from sqlalchemy.ext.asyncio import create_async_engine
from sqlmodel import SQLModel

# ---------------------------------------------------------------------------
# 通过 entry_points 自动发现所有已安装的 rapidkit 插件，
# 调用 register() 触发模型导入 → 注册到 SQLModel.metadata。
# 这样 Alembic autogenerate 就能检测到所有表的变更。
# ---------------------------------------------------------------------------
discovery = discover_migration_plugins(Path("plugins"))

# this is the Alembic Config object, which provides
# access to the values within the .ini file in use.
config = context.config

# Interpret the config file for Python logging.
# This line sets up loggers basically.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# add your model's MetaData object here
# for 'autogenerate' support
# from myapp import mymodel
# target_metadata = mymodel.Base.metadata
target_metadata = SQLModel.metadata
shared_enum_owners = enum_type_owners(target_metadata, discovery.table_to_plugin)

# other values from the config, defined by the needs of env.py,
# can be acquired:
# my_important_option = config.get_main_option("my_important_option")
# ... etc.

DATABASE_URL = str(settings.ASYNC_DATABASE_POSTGRESQL_URL)

config.set_main_option("sqlalchemy.url", DATABASE_URL)
config.compare_type = True  # type: ignore[attr-defined]
config.compare_server_default = True  # type: ignore[attr-defined]
plugin_name = context.get_x_argument(as_dictionary=True).get("plugin")
if plugin_name is not None:
    descriptor = discovery.plugins.get(plugin_name)
    if descriptor is None or descriptor.external:
        raise PluginDiscoveryError(f"unknown local migration plugin: {plugin_name}")


def include_object(
    obj: object,
    _name: str | None,
    object_type: str,
    _reflected: bool,
    _compare_to: object | None,
) -> bool:
    if plugin_name is None:
        return True
    return object_belongs_to_plugin(obj, object_type, plugin_name, discovery.table_to_plugin)


def render_item(item_type: str, obj: object, autogen_context: object) -> str | bool:
    """Reuse cross-plugin PostgreSQL enum types instead of creating duplicates."""
    if item_type != "type" or plugin_name is None:
        return False
    enum_name = getattr(obj, "name", None)
    owner = shared_enum_owners.get(enum_name)
    if owner is None or owner == plugin_name:
        return False
    imports = getattr(autogen_context, "imports")
    imports.add("from sqlalchemy.dialects import postgresql")
    values = ", ".join(repr(value) for value in getattr(obj, "enums"))
    return f"postgresql.ENUM({values}, name={enum_name!r}, create_type=False)"


@comparators.dispatch_for("schema")
def compare_enum_values(
    autogen_context: object,
    upgrade_ops: object,
    _schemas: object,
) -> None:
    """Add PostgreSQL enum member changes to plugin migrations."""
    if plugin_name is None:
        return
    connection = getattr(autogen_context, "connection")
    autogenerate_enum_value_ops(
        metadata=target_metadata,
        table_to_plugin=discovery.table_to_plugin,
        inspector=inspect(connection),
        upgrade_ops=upgrade_ops,
        plugin_name=plugin_name,
    )


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode.

    This configures the context with just a URL
    and not an Engine, though an Engine is acceptable
    here as well.  By skipping the Engine creation
    we don't even need a DBAPI to be available.

    Calls to context.execute() here emit the given string to the
    script output.

    """
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        compare_type=True,
        compare_server_default=True,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        include_object=include_object,
        render_item=render_item,
    )

    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection | None) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        compare_type=True,
        compare_server_default=True,
        include_object=include_object,
        render_item=render_item,
    )

    with context.begin_transaction():
        context.run_migrations()


async def run_migrations_online() -> None:
    """Run migrations in 'online' mode.

    In this scenario we need to create an Engine
    and associate a connection with the context.

    """

    connectable = create_async_engine(DATABASE_URL, echo=True, future=True)

    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)


if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_migrations_online())
