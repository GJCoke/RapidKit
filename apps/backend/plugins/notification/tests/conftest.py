"""plugin_notification 测试 conftest。"""

import os
import sys
from pathlib import Path
from typing import AsyncIterator

import pytest_asyncio
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool
from sqlmodel import SQLModel
from sqlmodel.ext.asyncio.session import AsyncSession

sys.path.insert(0, str(Path(__file__).resolve().parents[5]))

_ENV_DEFAULTS = {
    "POSTGRESQL_ASYNC_SCHEME": "postgresql+asyncpg",
    "POSTGRESQL_SYNC_SCHEME": "postgresql+psycopg",
    "POSTGRESQL_USERNAME": "test",
    "POSTGRESQL_PASSWORD": "test",
    "POSTGRESQL_HOST": "localhost",
    "POSTGRESQL_PORT": "5432",
    "POSTGRESQL_DATABASE": "test",
    "REDIS_ROOT_PASSWORD": "test",
    "REDIS_HOST": "localhost",
    "MINIO_ROOT_USER": "test",
    "MINIO_ROOT_PASSWORD": "test1234",
    "CORS_ORIGINS": '["*"]',
    "CORS_HEADERS": '["*"]',
    "ENVIRONMENT": "TESTING",
}

for key, value in _ENV_DEFAULTS.items():
    os.environ.setdefault(key, value)

from apps.backend.tests.testing.fixtures import *  # noqa: E402, F401, F403


@pytest_asyncio.fixture
async def db_session() -> AsyncIterator[AsyncSession]:
    """Provide an isolated real SQLModel session without external services."""
    engine = create_async_engine(
        "sqlite+aiosqlite://",
        poolclass=StaticPool,
    )
    async with engine.begin() as connection:
        await connection.run_sync(SQLModel.metadata.create_all)

    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with session_factory() as session:
        yield session

    async with engine.begin() as connection:
        await connection.run_sync(SQLModel.metadata.drop_all)
    await engine.dispose()
