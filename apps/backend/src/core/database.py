"""
Database Configuration.

This file configures the database connection using SQLAlchemy
and integrates it with FastAPI for asynchronous database operations.

Author : Coke
Date   : 2025-03-17
"""

import asyncio
from abc import ABC, abstractmethod
from typing import Any, AsyncIterator, Iterator

from redis.asyncio import ConnectionPool, Redis
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlmodel import Session, create_engine
from sqlmodel.ext.asyncio.session import AsyncSession

from src.core.config import settings
from src.core.log import logger

ASYNC_DATABASE_URL = str(settings.ASYNC_DATABASE_POSTGRESQL_URL)
SYNC_DATABASE_URL = str(settings.SYNC_DATABASE_POSTGRESQL_URL)
REDIS_URL = str(settings.REDIS_URL)

# Create an 'async and sync' SQLAlchemy engine for PostgreSQL connection.
# The 'echo' parameter is set based on the environment debug flag,
# and 'pool_recycle' ensures that database connections are recycled after 60 seconds.
async_engine = create_async_engine(ASYNC_DATABASE_URL, echo=settings.ENVIRONMENT.is_debug, pool_recycle=60)
sync_engine = create_engine(SYNC_DATABASE_URL, echo=settings.ENVIRONMENT.is_debug, pool_recycle=60)

# AsyncSessionLocal is the session maker used to create AsyncSession instances.
# 'expire_on_commit=False' prevents SQLAlchemy from automatically expiring objects after commit.
AsyncSessionLocal = async_sessionmaker(async_engine, class_=AsyncSession, expire_on_commit=False)
SyncSessionLocal = sessionmaker(sync_engine, class_=Session, expire_on_commit=False)


async def get_async_session() -> AsyncIterator[AsyncSession]:
    """
    提供异步数据库会话。

    本函数通过异步上下文管理器 yield 一个 SQLAlchemy AsyncSession 对象。
    通常用于 FastAPI 路由的异步依赖。

    Yields:
        异步 SQLAlchemy 会话实例。
    """
    async with AsyncSessionLocal() as session:
        yield session


def get_sync_session() -> Iterator[Session]:
    """
    提供同步数据库会话。

    本函数通过标准上下文管理器 yield 一个 SQLAlchemy Session 对象。
    适用于需要数据库访问的同步接口或任务。

    Yields:
        同步 SQLAlchemy 会话实例。
    """
    with SyncSessionLocal() as session:
        yield session


class BaseManager(ABC):
    """
    资源管理器抽象基类。

    定义了连接、断开和访问资源客户端（如数据库、Redis）的通用接口，
    子类需实现具体逻辑。
    """

    @classmethod
    @abstractmethod
    def connect(cls) -> Any:
        """
        建立资源连接。

        子类需实现具体连接逻辑。
        """
        ...

    @classmethod
    @abstractmethod
    def disconnect(cls) -> Any:
        """
        断开资源连接。

        子类需实现具体断开和资源释放逻辑。
        """
        ...

    @classmethod
    @abstractmethod
    def client(cls) -> Any:
        """
        返回已连接的客户端实例。

        子类需实现，返回可用于后续操作的客户端。
        """
        ...


class RedisManager(BaseManager):
    """
    Redis 连接池和客户端管理类。

    负责初始化和管理 Redis 连接池，提供 Redis 客户端，
    并保证全局唯一。
    """

    _pools: dict[str, ConnectionPool] = {}
    _clients: dict[str, Redis] = {}

    @classmethod
    def connect(
        cls, *, redis_url: str | None = None, pool_name: str = "default", max_connections: int | None = None
    ) -> ConnectionPool:
        """
        初始化 Redis 连接池（如未初始化）。

        Returns:
            已初始化的 Redis 连接池。

        Raises:
            RuntimeError: Redis 连接失败时抛出。
        """
        redis_url = redis_url or REDIS_URL
        max_connections = max_connections or settings.REDIS_MAX_CONNECTIONS
        if pool_name not in cls._pools:
            pool = ConnectionPool.from_url(redis_url, max_connections=max_connections, decode_responses=True)
            cls._pools[pool_name] = pool
            cls._clients[pool_name] = Redis(connection_pool=pool)
            logger.info(f'Redis connection pool for "{pool_name}" initialization completed.')

        return cls._pools[pool_name]

    @classmethod
    async def disconnect(cls, pool_name: str = "default") -> None:
        """
        关闭 Redis 连接池和客户端。
        """
        if pool_name in cls._pools:
            await cls._pools[pool_name].disconnect()
            logger.info(f'Redis connection pool for "{pool_name}" disconnect completed.')
            del cls._pools[pool_name]
            del cls._clients[pool_name]

    @classmethod
    async def clear(cls) -> None:
        """
        清理所有 Redis 连接池和客户端。
        """
        if cls._clients:
            await asyncio.gather(*(pool.disconnect() for pool in cls._pools.values()))
            cls._pools.clear()
            cls._clients.clear()

    @classmethod
    def client(cls, pool_name: str = "default") -> Redis:
        """
        返回已初始化的 Redis 客户端。

        Returns:
            已初始化的 Redis 客户端。

        Raises:
            RuntimeError: 客户端未初始化时抛出。
        """
        if pool_name not in cls._clients:
            raise RuntimeError(f'Redis client for pool "{pool_name}" not initialized.')
        return cls._clients[pool_name]
