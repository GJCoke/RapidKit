# packages/framework/src/rapidkit_framework/scopes.py
"""
数据范围与字段组声明：开发者在资源上声明可选项，管理员在角色上单选。

Author : Coke
Date   : 2026-10-19
"""

import re
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any, Literal
from uuid import UUID

from sqlalchemy import ColumnElement, false
from sqlmodel import col

SCOPE_KEY_PATTERN = re.compile(r"^[a-z][a-z0-9_]*$")
ALL_SCOPE = "all"

FieldMode = Literal["visible", "masked", "hidden"]
RestrictedMode = Literal["masked", "hidden"]
RESTRICTED_MODES: tuple[RestrictedMode, ...] = ("masked", "hidden")


@dataclass(frozen=True)
class ScopeContext:
    """构建范围条件所需的当前用户信息。"""

    user_id: UUID
    department_id: UUID | None = None
    dept_subtree_ids: tuple[UUID, ...] = ()


@dataclass(frozen=True)
class DataScopeDef:
    """
    一个可选的数据范围。

    Attributes:
        key: 范围键，小写字母开头的 snake_case；``all`` 为保留键。
        label: 界面名称。
        build: 由 ``ScopeContext`` 构建 SQL 条件。
        columns: 条件引用的模型列，启动时校验它们属于资源模型。
        needs_dept_subtree: 构建前是否需要加载当前用户的部门子树。
    """

    key: str
    label: str
    build: Callable[[ScopeContext], ColumnElement[bool]]
    columns: tuple[Any, ...] = ()
    needs_dept_subtree: bool = False

    def __post_init__(self) -> None:
        if not SCOPE_KEY_PATTERN.match(self.key):
            raise ValueError(f"invalid data scope key: {self.key!r}")
        if self.key == ALL_SCOPE:
            raise ValueError("data scope key 'all' is reserved")
        object.__setattr__(self, "columns", tuple(self.columns))


@dataclass(frozen=True)
class FieldGroupDef:
    """
    一组一起受控的字段。

    Attributes:
        key: 字段组键。
        label: 界面名称。
        fields: 模型字段名。
        modes: 允许设置的受控状态子集；"可见"始终可选。
    """

    key: str
    label: str
    fields: tuple[str, ...]
    modes: tuple[RestrictedMode, ...] = RESTRICTED_MODES

    def __post_init__(self) -> None:
        object.__setattr__(self, "fields", tuple(self.fields))
        object.__setattr__(self, "modes", tuple(self.modes))
        if not SCOPE_KEY_PATTERN.match(self.key):
            raise ValueError(f"invalid field group key: {self.key!r}")
        if not self.fields or len(set(self.fields)) != len(self.fields):
            raise ValueError("field group fields must be non-empty and unique")
        if not self.modes or len(set(self.modes)) != len(self.modes) or not set(self.modes) <= set(RESTRICTED_MODES):
            raise ValueError(f"invalid field group modes: {self.modes!r}")


def dept_subtree(column: Any, *, key: str = "dept_subtree", label: str = "本部门及以下") -> DataScopeDef:
    """``column`` 落在当前用户部门子树内；用户无部门时不可见任何数据。"""

    def build(ctx: ScopeContext) -> ColumnElement[bool]:
        if not ctx.dept_subtree_ids:
            return false()
        return col(column).in_(ctx.dept_subtree_ids)

    return DataScopeDef(key=key, label=label, build=build, columns=(column,), needs_dept_subtree=True)


def dept(column: Any, *, key: str = "dept", label: str = "本部门") -> DataScopeDef:
    """``column`` 等于当前用户部门；用户无部门时不可见任何数据。"""

    def build(ctx: ScopeContext) -> ColumnElement[bool]:
        if ctx.department_id is None:
            return false()
        return col(column) == ctx.department_id

    return DataScopeDef(key=key, label=label, build=build, columns=(column,))


def self_only(column: Any, *, key: str = "self", label: str = "仅本人") -> DataScopeDef:
    """``column`` 等于当前用户 ID。"""

    def build(ctx: ScopeContext) -> ColumnElement[bool]:
        return col(column) == ctx.user_id

    return DataScopeDef(key=key, label=label, build=build, columns=(column,))


def creator(column: Any, *, key: str = "creator", label: str = "本人创建") -> DataScopeDef:
    """``column``（通常为 ``created_by``）等于当前用户 ID。"""

    def build(ctx: ScopeContext) -> ColumnElement[bool]:
        return col(column) == ctx.user_id

    return DataScopeDef(key=key, label=label, build=build, columns=(column,))
