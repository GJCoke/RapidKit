"""Redis activity hints and revocation indexes; database state is authoritative."""

import json
import math
from datetime import UTC
from uuid import UUID

from rapidkit_core.timezone import timezone

from plugin_auth.impersonation.models import ImpersonationSession


def active_key(session_id: UUID) -> str:
    return f"auth:impersonation:<{session_id}>"


def actor_key(actor_id: UUID) -> str:
    return f"auth:impersonation:actor:<{actor_id}>"


def subject_key(subject_id: UUID) -> str:
    return f"auth:impersonation:subject:<{subject_id}>"


def sockets_key(session_id: UUID) -> str:
    return f"auth:impersonation:<{session_id}>:sockets"


async def cache_active(redis, record: ImpersonationSession) -> bool:
    ttl = math.ceil((record.expires_at - timezone.now()).total_seconds())
    if record.ended_at is not None or ttl <= 0:
        return False
    payload = json.dumps(
        {
            "actor_id": str(record.actor_id),
            "subject_user_id": str(record.subject_user_id),
            "expires_at": int(record.expires_at.replace(tzinfo=UTC).timestamp()),
        }
    )
    await redis.set(active_key(record.id), payload, ex=ttl)
    await redis.sadd(actor_key(record.actor_id), str(record.id))
    await redis.sadd(subject_key(record.subject_user_id), str(record.id))
    return True


async def clear_active(redis, record: ImpersonationSession) -> None:
    await redis.delete(active_key(record.id))
    await redis.srem(actor_key(record.actor_id), str(record.id))
    await redis.srem(subject_key(record.subject_user_id), str(record.id))
