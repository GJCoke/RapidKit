"""
DataPolicy dependency injection.

Author : Coke
Date   : 2026-04-30
"""

from typing import Literal

from fastapi import Depends, Request
from rapidkit_common.auth import UserDBDep
from rapidkit_common.deps import RedisDep, SessionDep
from rapidkit_common.models import SQLModel
from rapidkit_core.log import get_plugin_logger
from rapidkit_core.timezone import timezone
from rapidkit_policy_engine import TemplateContext
from sqlalchemy import ColumnElement
from sqlmodel import or_, true
from typing_extensions import Annotated, Doc

from plugin_permission.adapters import AuthPolicyLoader, RedisPermissionCache
from plugin_permission.audit import log_data_policy_result
from plugin_permission.bypass import is_permission_bypass
from plugin_permission.context import PermissionContext
from plugin_permission.data_policy.crud import DataPolicyCRUD
from plugin_permission.data_policy.filter_logic import build_filter_condition
from plugin_permission.data_policy.services import get_role_versions
from plugin_permission.rbac_config import rbac_config
from plugin_permission.role.deps import RoleCrudDep, create_user_permission_cache, permission_structure

logger = get_plugin_logger("Permission")


async def get_data_policy_crud(session: SessionDep) -> DataPolicyCRUD:
    """Provide DataPolicyCRUD instance."""
    return DataPolicyCRUD(session)


DataPolicyCrudDep = Annotated[
    DataPolicyCRUD,
    Depends(get_data_policy_crud),
    Doc("依赖项：提供 DataPolicyCRUD 实例。"),
]


class DataPermissionFilter:
    """
    Data permission filter as FastAPI Depends.

    Usage::

        @router.get("")
        async def get_items(
            data_filter: Annotated[ColumnElement[bool], Depends(DataPermissionFilter(MyModel))],
        ):
            items = await crud.get_paginate(data_filter, ...)

        @router.put("/{id}")
        async def update_item(
            write_filter: Annotated[ColumnElement[bool], Depends(DataPermissionFilter(MyModel, action="write"))],
        ):
            ...
    """

    def __init__(self, model: type[SQLModel], action: Literal["read", "write"] = "read") -> None:
        self.model = model
        self.action = action

    async def __call__(
        self,
        request: Request,
        user: UserDBDep,
        redis: RedisDep,
        role_crud: RoleCrudDep,
        session: SessionDep,
    ) -> ColumnElement[bool]:
        model_tablename = str(self.model.__tablename__)

        if is_permission_bypass(user):
            logger.debug(
                "Data policy bypassed: user_id={user_id} model={model} action={action} reason=admin",
                user_id=str(user.id),
                model=model_tablename,
                action=self.action,
            )
            log_data_policy_result(
                user_id=user.id,
                model=model_tablename,
                endpoint=request.url.path,
                method=request.method,
                policies_evaluated=[],
                result="admin_bypass",
                reason="user is admin",
            )
            return or_(true())

        # Try to reuse PermissionContext from RBAC dep
        perm_ctx: PermissionContext | None = getattr(request.state, "permission_ctx", None)

        if perm_ctx is None:
            cache_adapter = RedisPermissionCache(redis, permission_structure, rbac_config.PERMISSION_CACHE_TTL)
            cached = await cache_adapter.get(user.id)

            current_versions = await get_role_versions(redis, user.roles)

            if cached is not None:
                stale = set(cached.role_versions.keys()) != set(current_versions.keys()) or any(
                    cached.role_versions.get(k) != current_versions.get(k) for k in current_versions
                )
                if stale:
                    cached = None

            if cached is None:
                cached = await create_user_permission_cache(user.id, user.roles, redis, role_crud)

            perm_ctx = PermissionContext(
                user=user,
                cached_role_versions=cached.role_versions,
                current_role_versions=current_versions,
                data_policy_ids=list(cached.data_policy_ids),
                permissions=cached.permissions,
                buttons=cached.buttons,
            )

        if not perm_ctx.data_policy_ids:
            logger.debug(
                "Data policy bypassed: user_id={user_id} model={model} action={action} reason=no_policies",
                user_id=str(user.id),
                model=model_tablename,
                action=self.action,
            )
            log_data_policy_result(
                user_id=user.id,
                model=model_tablename,
                endpoint=request.url.path,
                method=request.method,
                policies_evaluated=[],
                result="no_policy",
                reason="no data policies assigned",
            )
            return or_(true())

        # Load policies
        policy_loader = AuthPolicyLoader(redis, session)
        policies = await perm_ctx.get_policies(policy_loader)

        if not policies:
            return or_(true())

        # Build template context
        now = timezone.now()
        ctx = TemplateContext(user=user, now=now)

        # Use filter_logic to build condition with deny-override
        condition = build_filter_condition(
            policies,
            action=self.action,
            model_tablename=model_tablename,
            model=self.model,
            ctx=ctx,
            session=session,
        )

        if condition is None:
            return or_(true())

        logger.info(
            "Data policy applied: user_id={user_id} model={model} action={action} endpoint={method} {path}",
            user_id=str(user.id),
            model=model_tablename,
            action=self.action,
            method=request.method,
            path=request.url.path,
        )

        relevant = [p for p in policies if p.target_model == model_tablename and self.action in p.actions]
        log_data_policy_result(
            user_id=user.id,
            model=model_tablename,
            endpoint=request.url.path,
            method=request.method,
            policies_evaluated=[p.id for p in relevant],
            result="filtered",
            reason="policies applied",
        )

        return condition
