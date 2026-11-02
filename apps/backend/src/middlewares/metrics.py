"""
请求指标采集中间件。

记录每次 HTTP 请求的 QPS、响应时间和错误计数到 Redis，
用于首页 Dashboard 的实时统计展示，以及按 API 维度的监控。

Author : Coke
Date   : 2026-04-10
"""

import asyncio
import re

from rapidkit_core import runtime_state
from rapidkit_core.database import RedisManager
from rapidkit_core.log import component_failed, component_recovered
from rapidkit_core.timezone import timezone

_background_tasks: set[asyncio.Task] = set()
MAX_IN_FLIGHT = 10
WRITE_TIMEOUT_SECONDS = 2


def record_dropped(error: Exception) -> None:
    runtime_state.increment("request_metrics_dropped")
    component_failed("request_metrics", error)


# Redis key TTL
_KEY_TTL = 7200  # 全局指标 2 小时
_HOUR_KEY_TTL = 7200  # 小时累计快照，为归档失败保留重试窗口
_EP_KEY_TTL = 120  # 按端点指标 120 秒（仅需撑到归档任务完成）

# 路径归一化：将 UUID 和纯数字替换为 {id}
_UUID_RE = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", re.IGNORECASE)
_NUMERIC_RE = re.compile(r"(?<=/)(\d+)(?=/|$)")


def _normalize_path(path: str) -> str:
    """将路径中的 UUID 和纯数字段替换为 {id}。"""
    path = _UUID_RE.sub("{id}", path)
    path = _NUMERIC_RE.sub("{id}", path)
    return path


async def _record_metrics(
    *,
    status_code: int,
    duration_ms: float,
    path: str,
    route_path: str | None = None,
    method: str = "GET",
    business_code: int | None = None,
    outcome: str | None = None,
) -> None:
    """将请求指标写入 Redis（fire-and-forget）。"""
    try:
        redis = RedisManager.client(pool_name="request_metrics")
        now = timezone.now()
        minute_bucket = now.strftime("%Y%m%d_%H%M")
        hour_bucket = now.strftime("%Y%m%d_%H")

        pipe = redis.pipeline(transaction=True)
        failed = outcome == "error" or status_code >= 400 or business_code not in (None, 0)

        # ── 全局指标（保持不变） ──

        # QPS 计数（按分钟）
        qps_key = f"metrics:qps:{minute_bucket}"
        pipe.hincrby(qps_key, "count", 1)
        pipe.expire(qps_key, _KEY_TTL)

        # 响应时间（按分钟，Sorted Set 用于计算 P50/P95）
        rt_key = f"metrics:rt:{minute_bucket}"
        member = f"{now.timestamp():.6f}:{path}"
        pipe.zadd(rt_key, {member: duration_ms})
        pipe.expire(rt_key, _KEY_TTL)

        # HTTP 5xx 错误计数（按小时）
        if status_code >= 500:
            err_key = f"metrics:errors:5xx:{hour_bucket}"
            pipe.hincrby(err_key, "count", 1)
            pipe.expire(err_key, _KEY_TTL)
        if business_code not in (None, 0):
            biz_key = f"metrics:errors:biz:{hour_bucket}"
            pipe.hincrby(biz_key, "count", 1)
            pipe.expire(biz_key, _KEY_TTL)

        # ── 按 API 端点维度指标 ──

        ep_path = route_path or _normalize_path(path)
        ep_key = f"metrics:api:{minute_bucket}:{method}:{ep_path}"

        pipe.hincrby(ep_key, "count", 1)
        pipe.hincrbyfloat(ep_key, "total_ms", duration_ms)
        if failed:
            pipe.hincrby(ep_key, "errors", 1)
        pipe.expire(ep_key, _EP_KEY_TTL)

        # 小时累计值供幂等归档；分钟数据继续服务实时统计。
        archive_key = f"metrics:api_hour:{hour_bucket}:{method}:{ep_path}"
        pipe.hincrby(archive_key, "count", 1)
        pipe.hincrbyfloat(archive_key, "total_ms", duration_ms)
        if failed:
            pipe.hincrby(archive_key, "errors", 1)
        pipe.expire(archive_key, _HOUR_KEY_TTL)

        # 按端点响应时间 Sorted Set
        ep_rt_key = f"metrics:api_rt:{minute_bucket}:{method}:{ep_path}"
        pipe.zadd(ep_rt_key, {f"{now.timestamp():.6f}": duration_ms})
        pipe.expire(ep_rt_key, _EP_KEY_TTL)

        async with asyncio.timeout(WRITE_TIMEOUT_SECONDS):
            await pipe.execute()
        component_recovered("request_metrics")
    except Exception as exc:
        record_dropped(exc)
