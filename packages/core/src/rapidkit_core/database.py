"""
Database Configuration.

Author : Coke
Date   : 2025-03-17
"""

import asyncio
from abc import ABC, abstractmethod
from typing import Any, AsyncIterator, Iterator

from pydantic_core import to_json
from rapidkit_common.transaction import run_after_commit_hooks
from redis.asyncio import ConnectionPool
from sqlalchemy.engine import Engine
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlmodel import Session, create_engine
from sqlmodel.ext.asyncio.session import AsyncSession

from rapidkit_core.log import logger
from rapidkit_core.proxy import LazyProxy
from rapidkit_core.redis_client import AsyncRedisClient

# ---------------------------------------------------------------------------
# Lazy engine factories
# ---------------------------------------------------------------------------

_async_engine_instance: AsyncEngine | None = None
_sync_engine_instance: Engine | None = None
_async_session_factory: async_sessionmaker[AsyncSession] | None = None
_sync_session_factory: sessionmaker[Session] | None = None


def _json_serializer(obj: Any) -> str:
    """使用 Pydantic 核心序列化器，原生支持 UUID、datetime 等类型。"""
    return to_json(obj).decode()


def get_async_engine() -> AsyncEngine:
    """获取异步数据库引擎单例（首次调用时创建）。"""
    global _async_engine_instance
    if _async_engine_instance is None:
        from rapidkit_core.config import get_settings

        s = get_settings()
        _async_engine_instance = create_async_engine(
            str(s.ASYNC_DATABASE_POSTGRESQL_URL),
            echo=s.ENVIRONMENT.is_debug,
            pool_recycle=300,
            json_serializer=_json_serializer,
        )
    return _async_engine_instance


def get_sync_engine() -> Engine:
    """获取同步数据库引擎单例（首次调用时创建）。"""
    global _sync_engine_instance
    if _sync_engine_instance is None:
        from rapidkit_core.config import get_settings

        s = get_settings()
        _sync_engine_instance = create_engine(
            str(s.SYNC_DATABASE_POSTGRESQL_URL),
            echo=s.ENVIRONMENT.is_debug,
            pool_recycle=300,
            json_serializer=_json_serializer,
        )
    return _sync_engine_instance


def get_async_session_factory() -> async_sessionmaker[AsyncSession]:
    """获取异步 session 工厂（首次调用时创建）。"""
    global _async_session_factory
    if _async_session_factory is None:
        _async_session_factory = async_sessionmaker(get_async_engine(), class_=AsyncSession, expire_on_commit=False)
    return _async_session_factory


def get_sync_session_factory() -> sessionmaker[Session]:
    """获取同步 session 工厂（首次调用时创建）。"""
    global _sync_session_factory
    if _sync_session_factory is None:
        _sync_session_factory = sessionmaker(get_sync_engine(), class_=Session, expire_on_commit=False)
    return _sync_session_factory


def override_async_engine(engine: Any) -> None:
    """替换异步引擎实例（测试注入 mock engine）。"""
    global _async_engine_instance, _async_session_factory
    _async_engine_instance = engine
    _async_session_factory = None


def override_sync_engine(engine: Any) -> None:
    """替换同步引擎实例。"""
    global _sync_engine_instance, _sync_session_factory
    _sync_engine_instance = engine
    _sync_session_factory = None


def reset_engines() -> None:
    """重置所有引擎和 session 工厂为 None（仅测试用）。"""
    global _async_engine_instance, _sync_engine_instance, _async_session_factory, _sync_session_factory
    _async_engine_instance = None
    _sync_engine_instance = None
    _async_session_factory = None
    _sync_session_factory = None


# ---------------------------------------------------------------------------
# Backward-compatible module-level proxies
# ---------------------------------------------------------------------------

async_engine: AsyncEngine = LazyProxy(get_async_engine)  # type: ignore
sync_engine: Engine = LazyProxy(get_sync_engine)  # type: ignore
AsyncSessionLocal: async_sessionmaker[AsyncSession] = LazyProxy(get_async_session_factory)  # type: ignore
SyncSessionLocal: sessionmaker[Session] = LazyProxy(get_sync_session_factory)  # type: ignore


def get_redis_url() -> str:
    """获取 Redis URL（延迟读取 settings）。"""
    from rapidkit_core.config import get_settings

    return str(get_settings().REDIS_URL)


# ---------------------------------------------------------------------------
# Session generators (use lazy factories internally)
# ---------------------------------------------------------------------------


async def get_async_session() -> AsyncIterator[AsyncSession]:
    """提供异步数据库会话，请求结束时自动 commit，异常时 rollback。"""

    factory = get_async_session_factory()
    async with factory() as session:
        try:
            yield session
            await session.commit()
            await run_after_commit_hooks(session)
        except Exception:
            await session.rollback()
            raise


def get_sync_session() -> Iterator[Session]:
    """提供同步数据库会话。"""
    factory = get_sync_session_factory()
    with factory() as session:
        yield session


# ---------------------------------------------------------------------------
# Resource Managers
# ---------------------------------------------------------------------------


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
        from rapidkit_core.config import get_settings

        redis_url = redis_url or get_redis_url()
        max_connections = max_connections or get_settings().REDIS_MAX_CONNECTIONS
        if pool_name not in cls._pools:
            pool = ConnectionPool.from_url(redis_url, max_connections=max_connections, decode_responses=True)
            cls._pools[pool_name] = pool
            cls._clients[pool_name] = AsyncRedisClient(connection_pool=pool)
            logger.info('Redis connection pool for "{pool_name}" initialization completed.', pool_name=pool_name)
        return cls._pools[pool_name]

    @classmethod
    async def disconnect(cls, pool_name: str = "default") -> None:
        if pool_name in cls._pools:
            await cls._pools[pool_name].disconnect()
            logger.info('Redis connection pool for "{pool_name}" disconnect completed.', pool_name=pool_name)
            del cls._pools[pool_name]
            del cls._clients[pool_name]

    @classmethod
    async def clear(cls) -> None:
        if cls._clients:
            await asyncio.gather(*(pool.disconnect() for pool in cls._pools.values()), return_exceptions=True)
            cls._pools.clear()
            cls._clients.clear()

    @classmethod
    def client(cls, pool_name: str = "default") -> AsyncRedisClient:
        if pool_name not in cls._clients:
            raise RuntimeError(f'Redis client for pool "{pool_name}" not initialized.')
        return cls._clients[pool_name]
