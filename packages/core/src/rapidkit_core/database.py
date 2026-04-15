"""
Database Configuration.

Author : Coke
Date   : 2025-03-17
"""

import asyncio
from abc import ABC, abstractmethod
from typing import Any, AsyncIterator, Iterator

from redis.asyncio import ConnectionPool
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlmodel import Session, create_engine
from sqlmodel.ext.asyncio.session import AsyncSession

from rapidkit_core.config import settings
from rapidkit_core.log import logger
from rapidkit_core.redis_client import AsyncRedisClient

ASYNC_DATABASE_URL = str(settings.ASYNC_DATABASE_POSTGRESQL_URL)
SYNC_DATABASE_URL = str(settings.SYNC_DATABASE_POSTGRESQL_URL)
REDIS_URL = str(settings.REDIS_URL)

async_engine = create_async_engine(ASYNC_DATABASE_URL, echo=settings.ENVIRONMENT.is_debug, pool_recycle=60)
sync_engine = create_engine(SYNC_DATABASE_URL, echo=settings.ENVIRONMENT.is_debug, pool_recycle=60)

AsyncSessionLocal = async_sessionmaker(async_engine, class_=AsyncSession, expire_on_commit=False)
SyncSessionLocal = sessionmaker(sync_engine, class_=Session, expire_on_commit=False)


async def get_async_session() -> AsyncIterator[AsyncSession]:
    """提供异步数据库会话。"""
    async with AsyncSessionLocal() as session:
        yield session


def get_sync_session() -> Iterator[Session]:
    """提供同步数据库会话。"""
    with SyncSessionLocal() as session:
        yield session


class BaseManager(ABC):
    """资源管理器抽象基类。"""

    @classmethod
    @abstractmethod
    def connect(cls) -> Any: ...

    @classmethod
    @abstractmethod
    def disconnect(cls) -> Any: ...

    @classmethod
    @abstractmethod
    def client(cls) -> Any: ...


class RedisManager(BaseManager):
    """Redis 连接池和客户端管理类。"""

    _pools: dict[str, ConnectionPool] = {}
    _clients: dict[str, AsyncRedisClient] = {}

    @classmethod
    def connect(
        cls, *, redis_url: str | None = None, pool_name: str = "default", max_connections: int | None = None
    ) -> ConnectionPool:
        redis_url = redis_url or REDIS_URL
        max_connections = max_connections or settings.REDIS_MAX_CONNECTIONS
        if pool_name not in cls._pools:
            pool = ConnectionPool.from_url(redis_url, max_connections=max_connections, decode_responses=True)
            cls._pools[pool_name] = pool
            cls._clients[pool_name] = AsyncRedisClient(connection_pool=pool)
            logger.info(f'Redis connection pool for "{pool_name}" initialization completed.')
        return cls._pools[pool_name]

    @classmethod
    async def disconnect(cls, pool_name: str = "default") -> None:
        if pool_name in cls._pools:
            await cls._pools[pool_name].disconnect()
            logger.info(f'Redis connection pool for "{pool_name}" disconnect completed.')
            del cls._pools[pool_name]
            del cls._clients[pool_name]

    @classmethod
    async def clear(cls) -> None:
        if cls._clients:
            await asyncio.gather(*(pool.disconnect() for pool in cls._pools.values()))
            cls._pools.clear()
            cls._clients.clear()

    @classmethod
    def client(cls, pool_name: str = "default") -> AsyncRedisClient:
        if pool_name not in cls._clients:
            raise RuntimeError(f'Redis client for pool "{pool_name}" not initialized.')
        return cls._clients[pool_name]
