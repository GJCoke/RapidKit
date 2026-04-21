"""
数据级权限过滤引擎。

根据用户角色的 DataScope 配置，生成 SQLAlchemy WHERE 条件表达式。

Author : Coke
Date   : 2026-04-20
"""

import operator as op
from uuid import UUID

from plugin_auth.auth.models import User
from plugin_auth.data_rule.crud import DataRuleCRUD
from plugin_auth.department.crud import DepartmentCRUD
from sqlalchemy import ColumnElement
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlmodel import Integer, Numeric, and_, col, false, or_, select, true
from sqlmodel.ext.asyncio.session import AsyncSession

from rapidkit_common.auth import UserProtocol
from rapidkit_common.enums import DataScope
from rapidkit_common.models import SQLModel as _SQLModel

# 操作符映射
_OPERATORS = {
    "eq": op.eq,
    "ne": op.ne,
    "gt": op.gt,
    "ge": op.ge,
    "lt": op.lt,
    "le": op.le,
}


_SCOPE_HANDLERS: dict[DataScope, str] = {
    DataScope.ALL: "_all",
    DataScope.SELF: "_self",
    DataScope.DEPT: "_dept",
    DataScope.DEPT_AND_CHILDREN: "_dept_and_children",
    DataScope.CUSTOM_DEPT: "_custom_dept",
    DataScope.CUSTOM_RULE: "_custom_rule",
}


async def build_data_filter(
    user: UserProtocol,
    session: AsyncSession,
    *,
    models: tuple[type[_SQLModel], ...],
    data_scope: DataScope = DataScope.SELF,
    custom_dept_ids: list[UUID] | None = None,
    data_rule_ids: list[UUID] | None = None,
) -> ColumnElement[bool]:
    """
    根据数据范围配置生成 SQLAlchemy WHERE 条件表达式。

    Args:
        user: 当前用户。
        session: 数据库会话。
        models: 目标模型类列表（用于 CUSTOM_RULE 匹配）。
        data_scope: 聚合后的数据范围。
        custom_dept_ids: CUSTOM_DEPT 的部门列表。
        data_rule_ids: CUSTOM_RULE 的规则 ID 列表。

    Returns:
        SQLAlchemy WHERE 条件表达式。
    """
    if user.is_admin:
        return or_(true())

    scope = DataScope(data_scope)

    if scope not in _SCOPE_HANDLERS:
        raise ValueError(f"Unknown data scope: {scope}")

    if scope == DataScope.ALL:
        return or_(true())

    if scope == DataScope.SELF:
        return _self_filter(user)

    if scope == DataScope.DEPT:
        return _dept_filter(user)

    if scope == DataScope.DEPT_AND_CHILDREN:
        return await _dept_and_children_filter(user, session)

    if scope == DataScope.CUSTOM_DEPT:
        if not custom_dept_ids:
            raise ValueError("custom_dept_ids is required when data_scope is CUSTOM_DEPT")
        return _custom_dept_filter(custom_dept_ids)

    # CUSTOM_RULE
    if not data_rule_ids:
        raise ValueError("data_rule_ids is required when data_scope is CUSTOM_RULE")
    return await _custom_rule_filter(user, session, models, data_rule_ids)


def _self_filter(user: UserProtocol) -> ColumnElement[bool]:
    """SELF: created_by = user.id"""
    return col(_SQLModel.created_by) == user.id


def _dept_filter(user: UserProtocol) -> ColumnElement[bool]:
    """DEPT: created_by IN (本部门所有用户)。"""
    if user.department_id is None:
        return col(_SQLModel.created_by) == user.id
    return col(_SQLModel.created_by).in_(_dept_user_subquery(user.department_id))


def _dept_user_subquery(dept_id: UUID):
    """子查询：获取指定部门所有用户的 ID。"""

    return select(User.id).filter(col(User.department_id) == dept_id)


async def _dept_and_children_filter(user: UserProtocol, session: AsyncSession) -> ColumnElement[bool]:
    """DEPT_AND_CHILDREN: created_by IN (本部门 + 所有子部门的用户)。"""
    if user.department_id is None:
        return col(_SQLModel.created_by) == user.id

    dept_crud = DepartmentCRUD(session)
    all_dept_ids = await dept_crud.get_children_ids(user.department_id)

    user_ids_query = select(User.id).filter(col(User.department_id).in_(all_dept_ids))
    return col(_SQLModel.created_by).in_(user_ids_query)


def _custom_dept_filter(dept_ids: list[UUID]) -> ColumnElement[bool]:
    """CUSTOM_DEPT: created_by IN (指定部门列表的用户)。"""
    if not dept_ids:
        return or_(false())

    user_ids_query = select(User.id).filter(col(User.department_id).in_(dept_ids))
    return col(_SQLModel.created_by).in_(user_ids_query)


async def _custom_rule_filter(
    user: UserProtocol,
    session: AsyncSession,
    models: tuple[type[_SQLModel], ...],
    rule_ids: list[UUID],
) -> ColumnElement[bool]:
    """CUSTOM_RULE: 解析 DataRule，构建动态 WHERE 子句。"""
    if not rule_ids or not models:
        return or_(false())

    rule_crud = DataRuleCRUD(session)
    rules = await rule_crud.get_by_ids(rule_ids)

    # 收集所有模型的 tablename
    model_names: dict[str, type[_SQLModel]] = {
        (str(m.__tablename__) if hasattr(m, "__tablename__") else m.__name__): m for m in models
    }

    conditions: list[ColumnElement[bool]] = []
    logic = rules[0].logic if rules else "AND"

    for rule in rules:
        model = model_names.get(rule.model_name)
        if model is None:
            continue
        condition = _build_rule_condition(rule, user, model)
        if condition is not None:
            conditions.append(condition)

    if not conditions:
        return or_(false())

    if logic == "OR":
        return or_(*conditions)
    return and_(*conditions)


def _build_rule_condition(rule, user: UserProtocol, model: type[_SQLModel]) -> ColumnElement[bool] | None:
    """根据单条 DataRule 构建 SQLAlchemy 条件表达式。"""
    value = _resolve_template(rule.value, user)

    if not hasattr(model, rule.field):
        return None
    column = getattr(model, rule.field)
    col_type = column.type

    operator_name = rule.operator.lower()

    if operator_name == "in":
        values = [_cast_value(v.strip(), col_type) for v in value.split(",")]
        return col(column).in_(values)
    elif operator_name == "not_in":
        values = [_cast_value(v.strip(), col_type) for v in value.split(",")]
        return col(column).not_in(values)
    elif operator_name in _OPERATORS:
        return _OPERATORS[operator_name](col(column), _cast_value(value, col_type))

    raise ValueError(f"Unknown data rule operator: {rule.operator}")


def _cast_value(value: str, col_type):
    """根据列类型将字符串值转换为对应 Python 类型。"""
    type_cls = type(col_type)

    if issubclass(type_cls, (PG_UUID,)):
        return UUID(value)
    if issubclass(type_cls, (Integer,)):
        return int(value)
    if issubclass(type_cls, (Numeric,)):
        return float(value)
    return value


def _resolve_template(value: str, user: UserProtocol) -> str:
    """解析模板变量 ${user_id} ${dept_id}。"""
    result = value.replace("${user_id}", str(user.id))
    if user.department_id:
        result = result.replace("${dept_id}", str(user.department_id))
    else:
        result = result.replace("${dept_id}", "")
    return result
