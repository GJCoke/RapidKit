"""
Database Deps.

Author : Coke
Date   : 2025-03-29
"""

from fastapi import Depends
from sqlmodel.ext.asyncio.session import AsyncSession
from typing_extensions import Annotated, Doc

from src.core.config import settings
from src.core.database import RedisManager, get_async_session
from src.core.redis_client import AsyncRedisClient

__all__ = [
    "SessionDep",
    "RedisDep",
]

SessionDep = Annotated[
    AsyncSession,
    Depends(get_async_session),
    Doc(
        """
        依赖项：用于数据库操作的 AsyncSession 实例。
        会话由 get_async_session 提供，自动管理数据库会话生命周期。
        """
    ),
]


async def get_redis_client() -> AsyncRedisClient:
    """
    获取当前 Redis 客户端的 AsyncRedisClient 实例。

    Returns:
        AsyncRedisClient: Redis 客户端实例。
    """
    client = RedisManager.client()
    return AsyncRedisClient(client=client, echo=settings.ENVIRONMENT.is_debug)


RedisDep = Annotated[
    AsyncRedisClient,
    Depends(get_redis_client),
    Doc(
        """
        依赖项：提供 AsyncRedisClient 实例，可用于操作 Redis 数据库。
        客户端由 get_redis_client 提供，自动管理 Redis 连接生命周期。
        """
    ),
]
