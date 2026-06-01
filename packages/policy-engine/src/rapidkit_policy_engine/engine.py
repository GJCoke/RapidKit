"""
Data policy rule engine.

Recursively resolves a JSON rule tree into a SQLAlchemy WHERE clause.

Author : Coke
Date   : 2026-04-30
"""

import logging
import operator as op
from uuid import UUID

from sqlalchemy import ColumnElement
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlmodel import Integer, Numeric, and_, col, false, null, or_, select, true
from sqlmodel import SQLModel as _SQLModel
from sqlmodel import Uuid as SA_UUID
from sqlmodel.ext.asyncio.session import AsyncSession

from rapidkit_policy_engine.template import TemplateContext, resolve_template_value

logger = logging.getLogger("rapidkit_policy_engine")

_MAX_DEPTH = 10

_OPERATORS = {
    "eq": op.eq,
    "ne": op.ne,
    "gt": op.gt,
    "ge": op.ge,
    "lt": op.lt,
    "le": op.le,
}


def resolve_rule_tree(
    tree: dict,
    ctx: TemplateContext,
    model: type[_SQLModel],
    *,
    models_map: dict[str, type[_SQLModel]] | None = None,
    session: AsyncSession | None = None,
) -> ColumnElement[bool]:
    """Top-level entry: resolve a rule tree dict into a WHERE clause."""
    if not isinstance(tree, dict) or "type" not in tree:
        logger.error("Invalid rule tree structure: %s", tree)
        return or_(false())

    visited: frozenset[str] = frozenset({str(model.__tablename__)})

    try:
        return _resolve_node(tree, ctx, model, models_map=models_map, session=session, depth=0, visited=visited)
    except Exception as e:
        logger.error("Rule tree resolution failed: %s", e)
        return or_(false())


def _resolve_node(
    node: dict,
    ctx: TemplateContext,
    model: type[_SQLModel],
    *,
    models_map: dict[str, type[_SQLModel]] | None,
    session: AsyncSession | None,
    depth: int,
    visited: frozenset[str],
) -> ColumnElement[bool]:
    """Recursive dispatcher."""
    if depth > _MAX_DEPTH:
        logger.warning("Rule tree exceeded max depth %d", _MAX_DEPTH)
        return or_(false())

    node_type = node.get("type")
    if node_type == "group":
        return _resolve_group(node, ctx, model, models_map=models_map, session=session, depth=depth, visited=visited)
    elif node_type == "condition":
        result = _resolve_condition(node, ctx, model)
        return result if result is not None else or_(false())
    elif node_type == "subquery":
        return _resolve_subquery(node, ctx, model, models_map=models_map, session=session, depth=depth, visited=visited)
    else:
        logger.warning("Unknown node type: %s", node_type)
        return or_(false())


def _resolve_group(
    node: dict,
    ctx: TemplateContext,
    model: type[_SQLModel],
    *,
    models_map: dict[str, type[_SQLModel]] | None = None,
    session: AsyncSession | None = None,
    depth: int = 0,
    visited: frozenset[str] = frozenset(),
) -> ColumnElement[bool]:
    """Resolve a group node (AND/OR combinator)."""
    conditions_raw = node.get("conditions", [])
    logic = node.get("logic", "AND").upper()

    if not conditions_raw:
        return or_(true())

    conditions: list[ColumnElement[bool]] = []
    for child in conditions_raw:
        result = _resolve_node(
            child, ctx, model, models_map=models_map, session=session, depth=depth + 1, visited=visited
        )
        conditions.append(result)

    if not conditions:
        return or_(true())

    if logic == "OR":
        return or_(*conditions)
    return and_(*conditions)


def _resolve_condition(
    node: dict,
    ctx: TemplateContext,
    model: type[_SQLModel],
) -> ColumnElement[bool] | None:
    """Resolve a single condition node."""
    field_name = node.get("field", "")
    operator_name = node.get("operator", "").lower()
    raw_value = node.get("value", "")

    if not hasattr(model, field_name):
        logger.warning("Field %s not found on model %s", field_name, model.__tablename__)
        return None

    column = getattr(model, field_name)

    if operator_name == "is_null":
        return col(column).is_(None)
    if operator_name == "is_not_null":
        return col(column).isnot(None)

    resolved = resolve_template_value(str(raw_value), ctx)

    if resolved is None:
        if operator_name in ("in", "not_in"):
            if operator_name == "not_in":
                return col(column).not_in([null()])
            return col(column).in_([null()])
        elif operator_name == "eq":
            return col(column).is_(None)
        elif operator_name == "ne":
            return col(column).isnot(None)
        elif operator_name in _OPERATORS:
            # gt/ge/lt/le with NULL has no meaningful semantics — deny
            return or_(false())
        return col(column).is_(None)

    col_type = column.type

    if operator_name == "in":
        values = _to_list(resolved, col_type)
        return col(column).in_(values)
    elif operator_name == "not_in":
        values = _to_list(resolved, col_type)
        return col(column).not_in(values)
    elif operator_name == "between":
        values = _to_list(resolved, col_type)
        if len(values) >= 2:
            return col(column).between(values[0], values[1])
        return or_(false())
    elif operator_name in _OPERATORS:
        cast_val = _cast_value(str(resolved) if not isinstance(resolved, list) else resolved[0], col_type)
        return _OPERATORS[operator_name](col(column), cast_val)

    logger.warning("Unknown operator: %s", operator_name)
    return or_(false())


def _resolve_subquery(
    node: dict,
    ctx: TemplateContext,
    parent_model: type[_SQLModel],
    *,
    models_map: dict[str, type[_SQLModel]] | None,
    session: AsyncSession | None,
    depth: int,
    visited: frozenset[str],
) -> ColumnElement[bool]:
    """Resolve a subquery condition."""
    field_name = node.get("field", "")
    operator_name = node.get("operator", "in").lower()
    target_model_name = node.get("model", "")
    target_field = node.get("target_field", "id")
    sub_filter = node.get("filter", {})

    if target_model_name in visited:
        logger.warning("Circular subquery reference detected: %s already in visited %s", target_model_name, visited)
        return or_(false())

    if models_map is None:
        logger.warning("Subquery requires models_map but none provided")
        return or_(false())

    target_model = models_map.get(target_model_name)
    if target_model is None:
        logger.warning("Subquery model not found: %s", target_model_name)
        return or_(false())

    if not hasattr(target_model, target_field):
        logger.warning("Subquery target field not found: %s", target_field)
        return or_(false())

    if not hasattr(parent_model, field_name):
        logger.warning("Subquery source field not found: %s", field_name)
        return or_(false())

    child_visited = visited | {target_model_name}
    sub_condition = _resolve_node(
        sub_filter, ctx, target_model, models_map=models_map, session=session, depth=depth + 1, visited=child_visited
    )
    target_column = getattr(target_model, target_field)
    subquery = select(target_column).where(sub_condition)

    source_column = getattr(parent_model, field_name)
    if operator_name == "not_in":
        return col(source_column).not_in(subquery)
    return col(source_column).in_(subquery)


def _to_list(value, col_type) -> list:
    """Convert a resolved value to a list for IN/NOT_IN/BETWEEN operators."""
    if isinstance(value, list):
        return [_cast_value(str(v), col_type) for v in value]
    return [_cast_value(v.strip(), col_type) for v in str(value).split(",")]


def _cast_value(value: str, col_type):
    """Cast string value to the appropriate Python type based on column type."""
    type_cls = type(col_type)
    if issubclass(type_cls, (PG_UUID, SA_UUID)):
        return UUID(value)
    if issubclass(type_cls, (Integer,)):
        return int(value)
    if issubclass(type_cls, (Numeric,)):
        return float(value)
    return value
