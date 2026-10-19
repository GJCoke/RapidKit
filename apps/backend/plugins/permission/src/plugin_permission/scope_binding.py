# apps/backend/plugins/permission/src/plugin_permission/scope_binding.py
"""
请求级数据范围绑定：把角色合并后的范围与字段规则绑定到本次请求的会话与序列化上下文。

Author : Coke
Date   : 2026-10-19
"""

from uuid import UUID

from fastapi import Request
from rapidkit_common.auth import UserProtocol
from rapidkit_common.protocols.department import DepartmentResolver
from rapidkit_common.scope_runtime import bind_session_field_rules, bind_session_scope, set_field_rules
from rapidkit_core.log import get_plugin_logger
from rapidkit_framework.scopes import ScopeContext
from rapidkit_framework.services import get_service_optional
from sqlmodel.ext.asyncio.session import AsyncSession

from plugin_permission.audit import log_data_scope_result
from plugin_permission.cache import CachedPermissions
from plugin_permission.catalog.registry import PermissionCatalog
from plugin_permission.scope_rules import build_condition, field_rules_for, needs_dept_subtree

logger = get_plugin_logger("Permission")


async def load_dept_subtree(user: UserProtocol) -> tuple[UUID, ...]:
    """读取用户部门子树；未安装部门插件或用户无部门时为空（范围条件将不匹配任何行）。"""
    department_id = getattr(user, "department_id", None)
    if department_id is None:
        return ()
    resolver = get_service_optional(DepartmentResolver)
    if resolver is None:
        logger.warning("DepartmentResolver unavailable: user_id={user_id}", user_id=str(user.id))
        return ()
    return tuple(await resolver.get_subtree_ids(department_id))


def clear_request_scope() -> None:
    """超级管理员请求：不处理字段。"""
    set_field_rules({})


async def bind_request_scope(
    *,
    code: str,
    user: UserProtocol,
    request: Request,
    session: AsyncSession,
    catalog: PermissionCatalog,
    cached: CachedPermissions,
) -> None:
    """
    绑定本次请求的字段规则（全部资源）与主资源行过滤条件。

    Args:
        code: 已通过 RBAC 校验的权限码，其资源为主资源。
        user: 当前用户。
        request: 当前请求，用于审计。
        session: 本次请求的数据库会话。
        catalog: 当前目录。
        cached: 用户权限缓存（含合并后的范围与字段状态）。
    """
    rules = field_rules_for(catalog, cached.field_modes)
    set_field_rules(rules)
    if rules:
        bind_session_field_rules(session, rules)

    resource = catalog.resource_of(code)
    keys = cached.data_scopes.get(resource.key, [])
    if not keys or resource.model is None:
        log_data_scope_result(
            user_id=user.id,
            resource=resource.key,
            endpoint=request.url.path,
            method=request.method,
            scope_keys=[],
            result="unrestricted",
        )
        return

    subtree = await load_dept_subtree(user) if needs_dept_subtree(resource, keys) else ()
    ctx = ScopeContext(user_id=user.id, department_id=getattr(user, "department_id", None), dept_subtree_ids=subtree)
    bind_session_scope(session, resource.model, build_condition(resource, keys, ctx))
    log_data_scope_result(
        user_id=user.id,
        resource=resource.key,
        endpoint=request.url.path,
        method=request.method,
        scope_keys=keys,
        result="filtered",
    )
