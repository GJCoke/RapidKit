"""
功能包纯函数规则：内置同步计划、授权合并与差异。

Author : Coke
Date   : 2026-10-17
"""

from collections.abc import Collection, Iterable, Mapping
from dataclasses import dataclass, field
from typing import Literal
from uuid import UUID

ApplyMode = Literal["merge", "replace"]

ALL_SCOPE = "all"
VISIBLE = "visible"


@dataclass(frozen=True)
class BuiltinPackage:
    """代码声明的内置功能包。"""

    key: str
    label: str
    description: str
    codes: tuple[str, ...]


@dataclass(frozen=True)
class ExistingPackage:
    """数据库中已有功能包的只读视图。"""

    id: UUID
    key: str
    builtin: bool
    label: str
    description: str
    codes: tuple[str, ...]


@dataclass
class BuiltinSyncPlan:
    """内置功能包同步计划。"""

    create: list[BuiltinPackage] = field(default_factory=list)
    update: list[tuple[UUID, BuiltinPackage]] = field(default_factory=list)
    delete: list[UUID] = field(default_factory=list)

    @property
    def is_empty(self) -> bool:
        return not (self.create or self.update or self.delete)


@dataclass(frozen=True)
class Grant:
    """一组授权：直接码、数据范围（不含 all）与字段状态（不含 visible）。"""

    codes: tuple[str, ...]
    data_scopes: Mapping[str, str] = field(default_factory=dict)
    field_modes: Mapping[str, Mapping[str, str]] = field(default_factory=dict)


@dataclass(frozen=True)
class ScopeChange:
    """一项数据范围或字段状态的变化；``group`` 为 None 表示数据范围。"""

    resource: str
    group: str | None
    before: str
    after: str


@dataclass(frozen=True)
class GrantDiff:
    """授权前后的差异。"""

    added_codes: list[str]
    removed_codes: list[str]
    scope_changes: list[ScopeChange]


def _unique[T](items: Iterable[T]) -> tuple[T, ...]:
    return tuple(dict.fromkeys(items))


def find_unknown_codes(codes: Iterable[str], known: Collection[str]) -> list[str]:
    """返回不在目录中的码，保持顺序并去重。"""
    return [code for code in _unique(codes) if code not in known]


def plan_builtin_sync(declared: list[BuiltinPackage], existing: list[ExistingPackage]) -> BuiltinSyncPlan:
    """
    计算内置功能包同步计划：按 key upsert，删除已不再声明的内置行，不触碰自定义行。

    Args:
        declared: 代码中声明的内置功能包。
        existing: 数据库中全部功能包。

    Returns:
        同步计划。
    """
    plan = BuiltinSyncPlan()
    by_key = {row.key: row for row in existing if row.builtin}
    declared_keys = {item.key for item in declared}
    for item in declared:
        row = by_key.get(item.key)
        if row is None:
            plan.create.append(item)
            continue
        current = BuiltinPackage(key=row.key, label=row.label, description=row.description, codes=row.codes)
        if current != item:
            plan.update.append((row.id, item))
    plan.delete = [row.id for row in existing if row.builtin and row.key not in declared_keys]
    return plan


def merge_grants(current: Grant, packages: list[Grant], mode: ApplyMode) -> Grant:
    """
    将功能包授权合并到角色当前授权。

    ``merge`` 保留当前授权，功能包的范围与字段状态按资源（字段按资源 + 字段组）覆盖；
    ``replace`` 只保留功能包授权。码去重并保序。
    """
    base = [current] if mode == "merge" else []
    grants = [*base, *packages]
    data_scopes: dict[str, str] = {}
    field_modes: dict[str, dict[str, str]] = {}
    for grant in grants:
        data_scopes.update(grant.data_scopes)
        for resource, groups in grant.field_modes.items():
            field_modes.setdefault(resource, {}).update(groups)
    return Grant(
        codes=_unique(code for grant in grants for code in grant.codes),
        data_scopes={resource: key for resource, key in data_scopes.items() if key != ALL_SCOPE},
        field_modes={
            resource: restricted
            for resource, groups in field_modes.items()
            if (restricted := {group: value for group, value in groups.items() if value != VISIBLE})
        },
    )


def diff_grants(before: Grant, after: Grant) -> GrantDiff:
    """计算授权前后的新增 / 移除码与范围 / 字段状态变化。"""

    def added[T](old: tuple[T, ...], new: tuple[T, ...]) -> list[T]:
        old_set = set(old)
        return [item for item in new if item not in old_set]

    changes: list[ScopeChange] = []
    for resource in _unique([*before.data_scopes, *after.data_scopes]):
        old, new = before.data_scopes.get(resource, ALL_SCOPE), after.data_scopes.get(resource, ALL_SCOPE)
        if old != new:
            changes.append(ScopeChange(resource=resource, group=None, before=old, after=new))
    for resource in _unique([*before.field_modes, *after.field_modes]):
        old_groups, new_groups = before.field_modes.get(resource, {}), after.field_modes.get(resource, {})
        for group in _unique([*old_groups, *new_groups]):
            old, new = old_groups.get(group, VISIBLE), new_groups.get(group, VISIBLE)
            if old != new:
                changes.append(ScopeChange(resource=resource, group=group, before=old, after=new))
    return GrantDiff(
        added_codes=added(before.codes, after.codes),
        removed_codes=added(after.codes, before.codes),
        scope_changes=changes,
    )
