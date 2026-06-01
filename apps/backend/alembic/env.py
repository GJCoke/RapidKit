import asyncio
import importlib.metadata
from logging.config import fileConfig

from alembic import context  # type: ignore
from rapidkit_core.config import settings
from sqlalchemy.engine.base import Connection
from sqlalchemy.ext.asyncio import create_async_engine
from sqlmodel import SQLModel

# ---------------------------------------------------------------------------
# 通过 entry_points 自动发现所有已安装的 rapidkit 插件，
# 调用 register() 触发模型导入 → 注册到 SQLModel.metadata。
# 这样 Alembic autogenerate 就能检测到所有表的变更。
# ---------------------------------------------------------------------------
for _ep in importlib.metadata.entry_points(group="rapidkit.plugins"):
    try:
        _register_fn = _ep.load()
        _register_fn()
    except Exception:
        pass  # 可选插件可能不可用

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

# other values from the config, defined by the needs of env.py,
# can be acquired:
# my_important_option = config.get_main_option("my_important_option")
# ... etc.

DATABASE_URL = str(settings.ASYNC_DATABASE_POSTGRESQL_URL)

config.set_main_option("sqlalchemy.url", DATABASE_URL)
config.compare_type = True  # type: ignore[attr-defined]
config.compare_server_default = True  # type: ignore[attr-defined]


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
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection | None) -> None:
    context.configure(connection=connection, target_metadata=target_metadata)

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
