"""
Celery 任务资源依赖类型标记。

任务函数通过类型注解声明所需资源，Task 基类根据注解按需创建并注入。

Author  : Coke
Date    : 2026-04-14
"""

from typing import NewType

from rapidkit_core.redis_client import AsyncRedisClient
from sqlalchemy.ext.asyncio import async_sessionmaker

TaskRedis = NewType("TaskRedis", AsyncRedisClient)
TaskSession = NewType("TaskSession", async_sessionmaker)
