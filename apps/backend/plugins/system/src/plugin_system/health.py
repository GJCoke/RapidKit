"""
基础设施健康检查。

Author : Coke
Date   : 2026-04-17
"""

import asyncio
import time

from minio import Minio
from rapidkit_common.deps import RedisDep, SessionDep
from rapidkit_core.config import settings
from sqlalchemy.pool import QueuePool
from sqlmodel import func, select
from starlette.concurrency import run_in_threadpool
from urllib3 import PoolManager, Timeout

from plugin_system.schemas import ServiceHealth

MINIO_CONNECT_TIMEOUT = 1.0
MINIO_READ_TIMEOUT = 1.0
MINIO_HEALTH_TIMEOUT = 2.0


async def check_pg(session: SessionDep) -> ServiceHealth:
    """检查 PostgreSQL 连接健康。"""
    try:
        start = time.time()
        await session.exec(select(func.now()))
        latency = round((time.time() - start) * 1000, 2)

        engine = session.get_bind()
        pool = engine.pool  # type: ignore[union-attr]  # ty: ignore[unresolved-attribute]
        assert isinstance(pool, QueuePool)
        pool_info = {
            "pool_size": pool.size(),
            "checked_in": pool.checkedin(),
            "checked_out": pool.checkedout(),
            "overflow": pool.overflow(),
        }
        return ServiceHealth(status="healthy", latency_ms=latency, details=pool_info)
    except Exception as e:
        return ServiceHealth(status="down", latency_ms=0, details={"error": str(e)})


async def check_redis(redis: RedisDep) -> ServiceHealth:
    """检查 Redis 连接健康。"""
    try:
        start = time.time()
        await redis.ping()  # type: ignore[misc]  # ty: ignore[invalid-await]
        latency = round((time.time() - start) * 1000, 2)

        info = await redis.info("memory")
        stats = await redis.info("stats")
        details = {
            "used_memory_human": info.get("used_memory_human", ""),
            "keyspace_hits": stats.get("keyspace_hits", 0),
            "keyspace_misses": stats.get("keyspace_misses", 0),
        }
        hits = details["keyspace_hits"]
        misses = details["keyspace_misses"]
        if hits + misses > 0:
            details["hit_rate"] = round(hits / (hits + misses) * 100, 2)

        return ServiceHealth(status="healthy", latency_ms=latency, details=details)
    except Exception as e:
        return ServiceHealth(status="down", latency_ms=0, details={"error": str(e)})


def _check_minio_sync() -> ServiceHealth:
    """使用同步 MinIO SDK 检查连接健康。"""
    http_client = PoolManager(
        timeout=Timeout(connect=MINIO_CONNECT_TIMEOUT, read=MINIO_READ_TIMEOUT),
        retries=False,
    )
    try:
        start = time.time()
        client = Minio(
            "localhost:9000",
            access_key=settings.MINIO_ROOT_USER,
            secret_key=settings.MINIO_ROOT_PASSWORD.get_secret_value(),
            secure=False,
            http_client=http_client,
        )
        buckets = client.list_buckets()
        latency = round((time.time() - start) * 1000, 2)

        return ServiceHealth(
            status="healthy",
            latency_ms=latency,
            details={"bucket_count": len(buckets)},
        )
    except Exception as e:
        return ServiceHealth(status="down", latency_ms=0, details={"error": str(e)})
    finally:
        http_client.clear()


async def check_minio(timeout: float = MINIO_HEALTH_TIMEOUT) -> ServiceHealth:
    """在线程池中执行 MinIO 健康检查，避免阻塞事件循环。"""
    try:
        return await asyncio.wait_for(run_in_threadpool(_check_minio_sync), timeout=timeout)
    except TimeoutError as e:
        return ServiceHealth(status="down", latency_ms=0, details={"error": str(e)})
