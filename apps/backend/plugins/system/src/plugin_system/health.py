"""
基础设施健康检查。

Author : Coke
Date   : 2026-04-17
"""

import time

from rapidkit_common.deps import RedisDep, SessionDep
from rapidkit_core.config import settings
from sqlalchemy.pool import QueuePool
from sqlmodel import func, select

from plugin_system.schemas import ServiceHealth


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


def check_minio() -> ServiceHealth:
    """检查 MinIO 连接健康。"""
    try:
        start = time.time()
        client = __import__("minio").Minio(
            "localhost:9000",
            access_key=settings.MINIO_ROOT_USER,
            secret_key=settings.MINIO_ROOT_PASSWORD.get_secret_value(),
            secure=False,
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
