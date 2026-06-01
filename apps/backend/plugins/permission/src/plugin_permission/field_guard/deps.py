"""
FieldPolicy dependency injection.

Author : Coke
Date   : 2026-05-13
"""

from typing import Literal

from fastapi import Request
from rapidkit_common.auth import UserDBDep
from rapidkit_common.deps import RedisDep, SessionDep
from rapidkit_common.models import SQLModel
from rapidkit_core.log import get_plugin_logger

from plugin_permission.adapters import RedisPermissionCache
from plugin_permission.bypass import is_permission_bypass
from plugin_permission.context import PermissionContext
from rapidkit_common.field_permission import FieldRestrictions

from plugin_permission.field_guard.crud import FieldPolicyCRUD
from plugin_permission.field_guard.services import build_field_restrictions
from plugin_permission.providers import permission_structure
from plugin_permission.rbac_config import rbac_config

logger = get_plugin_logger("Permission")


class FieldPermissionFilter:
    """
    Field permission filter as FastAPI Depends.

    Usage::

        @router.get("")
        async def get_items(
            field_rules: Annotated[FieldRestrictions, Depends(FieldPermissionFilter(MyModel))],
        ):
            return serialize_with_restrictions(data, field_rules)
    """

    def __init__(self, model: type[SQLModel], action: Literal["read", "write"] = "read") -> None:
        self.model = model
        self.action = action

    async def __call__(
        self,
        request: Request,
        user: UserDBDep,
        redis: RedisDep,
        session: SessionDep,
    ) -> FieldRestrictions:
        if is_permission_bypass(user):
            return FieldRestrictions()

        # Get field_policy_ids from PermissionContext or cache
        perm_ctx: PermissionContext | None = getattr(request.state, "permission_ctx", None)

        field_policy_ids: list = []
        if perm_ctx is not None and hasattr(perm_ctx, "field_policy_ids"):
            field_policy_ids = perm_ctx.field_policy_ids
        else:
            cache_adapter = RedisPermissionCache(redis, permission_structure, rbac_config.PERMISSION_CACHE_TTL)
            cached = await cache_adapter.get(user.id)
            if cached is not None:
                field_policy_ids = list(cached.field_policy_ids)

        if not field_policy_ids:
            return FieldRestrictions()

        # Load field policies from DB
        crud = FieldPolicyCRUD(session)
        policies = await crud.get_by_ids(field_policy_ids)

        if not policies:
            return FieldRestrictions()

        model_tablename = str(self.model.__tablename__)
        return build_field_restrictions(policies, action=self.action, model_tablename=model_tablename)
