"""
Protocol adapter implementations for RBAC/ABAC common modules.

Bridges the RBAC plugin's concrete infrastructure (Redis, RoleCRUD, DataPolicyCRUD)
to the abstract Protocol interfaces defined in rapidkit_common.

Author : Coke
Date   : 2026-05-07
"""

from datetime import timedelta
from uuid import UUID

from rapidkit_common.enums import Status
from rapidkit_core.redis_client import AsyncRedisClient

from plugin_permission.cache import CachedPermissions, PermissionCache
from plugin_permission.data_policy.crud import DataPolicyCRUD
from plugin_permission.data_policy.schemas import DataPolicyResponse
from plugin_permission.data_policy.services import get_role_versions
from plugin_permission.models import DataPolicy
from plugin_permission.rbac_config import rbac_config
from plugin_permission.role.crud import RoleCRUD


class RedisPermissionCache(PermissionCache):
    """Adapts AsyncRedisClient to PermissionCache Protocol."""

    def __init__(self, redis: AsyncRedisClient, key_template: str, ttl: int | timedelta) -> None:
        self._redis = redis
        self._key_template = key_template
        self._ttl = ttl

    async def get(self, user_id: UUID) -> CachedPermissions | None:
        key = self._key_template.format(user_id=user_id)
        return await self._redis.get(key, response_model=CachedPermissions)

    async def set(self, user_id: UUID, data: CachedPermissions) -> None:
        key = self._key_template.format(user_id=user_id)
        await self._redis.set(key, data, ex=self._ttl)

    async def invalidate(self, user_id: UUID) -> None:
        key = self._key_template.format(user_id=user_id)
        await self._redis.delete(key)


class AuthRoleResolver:
    """Resolves role codes into aggregated CachedPermissions."""

    def __init__(self, role_crud: RoleCRUD, redis: AsyncRedisClient) -> None:
        self._crud = role_crud
        self._redis = redis

    async def resolve(self, role_codes: list[str]) -> CachedPermissions:
        roles = await self._crud.get_role_by_codes(role_codes)
        permissions = [p for role_info in roles for p in role_info.interface_permissions]
        buttons = list({b for role_info in roles for b in (role_info.button_permissions or [])})
        data_policy_ids: list[UUID] = list({pid for role in roles for pid in (role.data_policy_ids or [])})
        field_policy_ids: list[UUID] = list({pid for role in roles for pid in (role.field_policy_ids or [])})
        role_versions = await get_role_versions(self._redis, role_codes)
        return CachedPermissions(
            permissions=permissions,
            buttons=buttons,
            data_policy_ids=data_policy_ids,
            field_policy_ids=field_policy_ids,
            role_versions=role_versions,
        )


class AuthPolicyLoader:
    """Adapts Redis-cached + DB-fallback policy loading to PolicyLoader Protocol."""

    def __init__(self, redis: AsyncRedisClient, session) -> None:
        self._redis = redis
        self._session = session

    async def load(self, policy_ids: list[UUID]) -> list:
        if not policy_ids:
            return []

        # Batch fetch from Redis (1 roundtrip)
        keys = [f"auth:policy:{pid}" for pid in policy_ids]
        cached_results = await self._redis.mget(keys)

        policies: list[DataPolicy] = []
        uncached_ids: list[UUID] = []

        for pid, cached_json in zip(policy_ids, cached_results):
            if cached_json is not None:
                cached = DataPolicyResponse.model_validate_json(cached_json)
                p = DataPolicy(
                    name=cached.name,
                    description=cached.description,
                    target_model=cached.target_model,
                    rule=cached.rule,
                    status=cached.status,
                )
                p.id = pid
                policies.append(p)
            else:
                uncached_ids.append(pid)

        if uncached_ids:
            crud = DataPolicyCRUD(self._session)
            db_policies = await crud.get_by_ids(uncached_ids)
            pipe = self._redis.pipeline()
            for p in db_policies:
                cache_data = DataPolicyResponse.model_validate(p)
                pipe.set(f"auth:policy:{p.id}", cache_data.model_dump_json(), ex=rbac_config.POLICY_CACHE_TTL)
                policies.append(p)
            await pipe.execute()

        return [p for p in policies if p.status == Status.ON]
