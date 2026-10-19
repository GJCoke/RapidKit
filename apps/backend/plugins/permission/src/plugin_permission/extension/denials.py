"""
403 被拒码记录：Redis 按天聚合 + 最近一次详情，供实施人员排查漏配。

记录失败只写 WARNING，绝不影响 403 响应。

Author : Coke
Date   : 2026-10-17
"""

import json
from datetime import timedelta
from uuid import UUID

from rapidkit_core.log import get_plugin_logger
from rapidkit_core.redis_client import AsyncRedisClient
from rapidkit_core.timezone import timezone

from plugin_permission.audit import log_permission_denied
from plugin_permission.extension.schemas import DenialRecord

logger = get_plugin_logger("Permission")

DENIAL_DAY_KEY = "auth:denials:{day}"
DENIAL_LAST_KEY = "auth:denials:last"
DENIAL_RETENTION_DAYS = 8
DENIAL_LIST_LIMIT = 100


def _day_key(day: str) -> str:
    return DENIAL_DAY_KEY.format(day=day)


async def record_denial(
    redis: AsyncRedisClient,
    *,
    user_id: UUID,
    code: str,
    route_key: str,
    role_versions: dict[str, int],
    catalog_version: int,
) -> None:
    """记录一次被拒：审计日志 + 当日计数 + 最近一次详情。"""
    log_permission_denied(
        user_id=user_id,
        code=code,
        route_key=route_key,
        role_versions=role_versions,
        catalog_version=catalog_version,
    )
    now = timezone.now()
    member = f"{code}|{route_key}"
    key = _day_key(now.strftime("%Y%m%d"))
    try:
        await redis.hincrby(key, member, 1)
        await redis.expire(key, timedelta(days=DENIAL_RETENTION_DAYS))
        await redis.hset(
            DENIAL_LAST_KEY,
            member,
            json.dumps({"at": now.isoformat(), "userId": str(user_id), "catalogVersion": catalog_version}),
        )
    except Exception as exc:
        logger.warning("Permission denial record failed: code={code} error={error}", code=code, error=exc)


async def list_recent_denials(
    redis: AsyncRedisClient,
    *,
    days: int,
    labels: dict[str, str],
) -> list[DenialRecord]:
    """
    聚合最近 ``days`` 天（含今天）的被拒记录，按次数降序。

    Args:
        redis: AsyncRedisClient 实例。
        days: 天数，1–7。
        labels: 码 → 显示名称。

    Returns:
        至多 100 条 DenialRecord。
    """
    today = timezone.now()
    counts: dict[str, int] = {}
    for offset in range(days):
        bucket = await redis.hgetall(_day_key((today - timedelta(days=offset)).strftime("%Y%m%d")))
        for member, value in bucket.items():
            counts[member] = counts.get(member, 0) + int(value)
    if not counts:
        return []

    last = await redis.hgetall(DENIAL_LAST_KEY)
    records: list[DenialRecord] = []
    for member, count in sorted(counts.items(), key=lambda item: (-item[1], item[0]))[:DENIAL_LIST_LIMIT]:
        code, route_key = member.split("|", 1)
        detail = json.loads(last[member]) if member in last else {}
        records.append(
            DenialRecord(
                code=code,
                route_key=route_key,
                code_label=labels.get(code),
                count=count,
                last_at=detail.get("at"),
                last_user_id=detail.get("userId"),
            )
        )
    return records
