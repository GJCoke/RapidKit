"""
Pure logic for building ABAC filter conditions.

Separated from FastAPI dependencies for testability.

Author : Coke
Date   : 2026-05-13
"""

from typing import Literal

from rapidkit_common.models import SQLModel
from rapidkit_framework.plugin import get_loaded_models
from rapidkit_policy_engine import TemplateContext, resolve_rule_tree
from sqlalchemy import ColumnElement, not_
from sqlmodel import and_, or_, true
from sqlmodel.ext.asyncio.session import AsyncSession

from plugin_permission.cache import PolicyLike


def build_filter_condition(
    policies: list[PolicyLike],
    *,
    action: Literal["read", "write"],
    model_tablename: str,
    model: type[SQLModel] | None = None,
    ctx: TemplateContext | None = None,
    session: AsyncSession | None = None,
) -> ColumnElement[bool] | None:
    """
    Build a SQLAlchemy WHERE condition from policies.

    Returns None if no policies apply (caller should treat as allow-all).

    Logic:
    1. Filter policies by target_model and action
    2. Separate allow vs deny
    3. Combine: allow_cond AND NOT deny_cond
    """
    # Filter by target_model and action
    relevant = [p for p in policies if p.target_model == model_tablename and action in p.actions]

    if not relevant:
        return None

    allow_policies = [p for p in relevant if p.effect == "allow"]
    deny_policies = [p for p in relevant if p.effect == "deny"]

    models_map = get_loaded_models() if model else None

    allow_conditions: list[ColumnElement[bool]] = []
    deny_conditions: list[ColumnElement[bool]] = []

    if model and ctx:
        for p in allow_policies:
            if p.rule:
                cond = resolve_rule_tree(p.rule, ctx, model, models_map=models_map, session=session)
                allow_conditions.append(cond)
            else:
                allow_conditions.append(true())

        for p in deny_policies:
            if p.rule:
                cond = resolve_rule_tree(p.rule, ctx, model, models_map=models_map, session=session)
                deny_conditions.append(cond)
            else:
                deny_conditions.append(true())
    else:
        # No model/ctx provided (testing mode): use true() markers
        for _ in allow_policies:
            allow_conditions.append(true())
        for _ in deny_policies:
            deny_conditions.append(true())

    allow_cond = or_(*allow_conditions) if allow_conditions else None
    deny_cond = or_(*deny_conditions) if deny_conditions else None

    if allow_cond is not None and deny_cond is not None:
        return and_(allow_cond, not_(deny_cond))
    elif allow_cond is not None:
        return allow_cond
    elif deny_cond is not None:
        return not_(deny_cond)
    else:
        return None
