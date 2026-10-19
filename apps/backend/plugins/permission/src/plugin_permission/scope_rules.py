# apps/backend/plugins/permission/src/plugin_permission/scope_rules.py
"""
数据范围与字段状态的纯函数规则。

- ``resolve_role_scopes``：单个角色已存配置 → 实际生效值；声明失效时取更严格的值。
- ``merge_role_scopes``：多角色合并；范围取并集，字段状态取最宽松。
- ``ensure_valid_scopes``：保存前校验并去掉默认值。

Author : Coke
Date   : 2026-10-19
"""

from collections.abc import Iterable, Mapping
from dataclasses import dataclass, field
from typing import cast

from rapidkit_framework.exceptions import AppException
from rapidkit_framework.plugin import ResourceDef
from rapidkit_framework.scopes import ALL_SCOPE, FieldMode, RestrictedMode, ScopeContext
from rapidkit_framework.status_codes import BaseStatusCode
from sqlalchemy import ColumnElement, false, or_

from plugin_permission.catalog.registry import PermissionCatalog

VISIBLE = "visible"
_PERMISSIVENESS = {"hidden": 0, "masked": 1, VISIBLE: 2}


@dataclass(frozen=True)
class InvalidScope:
    """已存配置因声明变化被收紧处理的一项。"""

    resource: str
    group: str | None
    stored: str
    effective: str


@dataclass(frozen=True)
class ResolvedScopes:
    """单个角色实际生效的范围与字段状态（不含默认值 all / visible）。"""

    data_scopes: dict[str, str] = field(default_factory=dict)
    field_modes: dict[str, dict[str, FieldMode]] = field(default_factory=dict)
    invalid: list[InvalidScope] = field(default_factory=list)


def _strictest(modes: tuple[RestrictedMode, ...]) -> RestrictedMode:
    return "hidden" if "hidden" in modes else modes[0]


def resolve_role_scopes(
    data_scopes: Mapping[str, str],
    field_modes: Mapping[str, Mapping[str, str]],
    catalog: PermissionCatalog,
) -> ResolvedScopes:
    """
    把角色已存配置解析为实际生效值。

    范围键不存在时取该资源声明中最窄的范围（声明顺序最后一个），资源已无范围声明时为全部；
    字段组不存在时忽略；状态不再被允许时取该组允许的最严格状态。

    Args:
        data_scopes: 角色存储的 资源 → 范围键。
        field_modes: 角色存储的 资源 → 字段组 → 状态。
        catalog: 当前目录。

    Returns:
        生效值与被收紧的项。
    """
    resolved = ResolvedScopes()
    for resource_key, key in data_scopes.items():
        if key == ALL_SCOPE:
            continue
        resource = catalog.resources.get(resource_key)
        declared = [scope.key for scope in resource.data_scopes] if resource is not None else []
        if key in declared:
            resolved.data_scopes[resource_key] = key
        elif declared:
            resolved.data_scopes[resource_key] = declared[-1]
            resolved.invalid.append(InvalidScope(resource_key, None, key, declared[-1]))
        else:
            resolved.invalid.append(InvalidScope(resource_key, None, key, ALL_SCOPE))
    for resource_key, groups in field_modes.items():
        resource = catalog.resources.get(resource_key)
        declared_groups = {group.key: group for group in resource.field_groups} if resource is not None else {}
        for group_key, mode in groups.items():
            if mode == VISIBLE:
                continue
            group = declared_groups.get(group_key)
            if group is None:
                resolved.invalid.append(InvalidScope(resource_key, group_key, mode, VISIBLE))
                continue
            effective = cast(RestrictedMode, mode) if mode in group.modes else _strictest(group.modes)
            resolved.field_modes.setdefault(resource_key, {})[group_key] = effective
            if effective != mode:
                resolved.invalid.append(InvalidScope(resource_key, group_key, mode, effective))
    return resolved


def merge_role_scopes(
    roles: Iterable[ResolvedScopes],
    catalog: PermissionCatalog,
) -> tuple[dict[str, list[str]], dict[str, dict[str, str]]]:
    """
    合并多个角色：范围取并集（任一角色为全部即不过滤），字段状态取最宽松。

    Returns:
        (资源 → 范围键列表（声明顺序，合并为全部的资源不写入），资源 → 字段组 → 状态（可见不写入))。
    """
    resolved = list(roles)
    if not resolved:
        return {}, {}
    data: dict[str, list[str]] = {}
    fields: dict[str, dict[str, str]] = {}
    for resource_key, resource in catalog.resources.items():
        if resource.data_scopes:
            keys = [role.data_scopes.get(resource_key, ALL_SCOPE) for role in resolved]
            if ALL_SCOPE not in keys:
                data[resource_key] = [scope.key for scope in resource.data_scopes if scope.key in keys]
        for group in resource.field_groups:
            modes = [role.field_modes.get(resource_key, {}).get(group.key, VISIBLE) for role in resolved]
            loosest = max(modes, key=lambda mode: _PERMISSIVENESS[mode])
            if loosest != VISIBLE:
                fields.setdefault(resource_key, {})[group.key] = loosest
    return data, fields


def ensure_valid_scopes(
    data_scopes: Mapping[str, str],
    field_modes: Mapping[str, Mapping[str, str]],
    catalog: PermissionCatalog,
    *,
    error: BaseStatusCode,
    preserve_defaults: bool = False,
) -> tuple[dict[str, str], dict[str, dict[str, str]]]:
    """
    保存前校验并去掉默认值。

    Raises:
        AppException: ``error``，``data`` 为 ``{"items": ["资源=范围", "资源.字段组=状态", ...]}``。

    Returns:
        (资源 → 范围键, 资源 → 字段组 → 状态)，不含 all / visible。
    """
    items: list[str] = []
    data: dict[str, str] = {}
    fields: dict[str, dict[str, str]] = {}
    for resource_key, key in data_scopes.items():
        resource = catalog.resources.get(resource_key)
        declared = {scope.key for scope in resource.data_scopes} if resource is not None else set()
        if resource is None or (key != ALL_SCOPE and key not in declared):
            items.append(f"{resource_key}={key}")
        elif key != ALL_SCOPE or preserve_defaults:
            data[resource_key] = key
    for resource_key, groups in field_modes.items():
        resource = catalog.resources.get(resource_key)
        declared_groups = {group.key: group for group in resource.field_groups} if resource is not None else {}
        for group_key, mode in groups.items():
            group = declared_groups.get(group_key)
            if group is None or (mode != VISIBLE and mode not in group.modes):
                items.append(f"{resource_key}.{group_key}={mode}")
            elif mode != VISIBLE or preserve_defaults:
                fields.setdefault(resource_key, {})[group_key] = mode
    if items:
        raise AppException(error, data={"items": items})
    return data, fields


def needs_dept_subtree(resource: ResourceDef, keys: Iterable[str]) -> bool:
    """所选范围是否需要部门子树。"""
    selected = set(keys)
    return any(scope.needs_dept_subtree for scope in resource.data_scopes if scope.key in selected)


def build_condition(resource: ResourceDef, keys: Iterable[str], ctx: ScopeContext) -> ColumnElement[bool]:
    """所选范围条件的 OR 组合。"""
    selected = set(keys)
    parts = [scope.build(ctx) for scope in resource.data_scopes if scope.key in selected]
    if not parts:
        return false()
    return parts[0] if len(parts) == 1 else or_(*parts)


def field_rules_for(
    catalog: PermissionCatalog, field_modes: Mapping[str, Mapping[str, str]]
) -> dict[type, dict[str, RestrictedMode]]:
    """资源 → 字段组 → 状态 映射为 模型 → 字段 → 状态（仅受控项）。"""
    rules: dict[type, dict[str, RestrictedMode]] = {}
    for resource_key, fields in restricted_fields(catalog, field_modes).items():
        model = catalog.resources[resource_key].model
        if model is not None:
            rules[model] = fields
    return rules


def restricted_fields(
    catalog: PermissionCatalog, field_modes: Mapping[str, Mapping[str, str]]
) -> dict[str, dict[str, RestrictedMode]]:
    """资源 → 字段组 → 状态 映射为 资源 → 字段 → 状态（仅受控项）。"""
    result: dict[str, dict[str, RestrictedMode]] = {}
    for resource_key, groups in field_modes.items():
        resource = catalog.resources.get(resource_key)
        if resource is None:
            continue
        declared_groups = {group.key: group for group in resource.field_groups}
        for group_key, mode in groups.items():
            group = declared_groups.get(group_key)
            if group is None or mode == VISIBLE:
                continue
            for name in group.fields:
                result.setdefault(resource_key, {})[name] = cast(RestrictedMode, mode)
    return result
