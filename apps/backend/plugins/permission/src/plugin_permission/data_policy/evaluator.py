"""
In-memory policy evaluation for create operations.

For create, the target row doesn't exist yet, so we evaluate the new
object's attributes against policy conditions in-memory rather than
generating SQL WHERE clauses.

Author : Coke
Date   : 2026-05-13
"""

from collections.abc import Callable

from rapidkit_common.auth import UserProtocol
from rapidkit_core.log import get_plugin_logger
from rapidkit_core.timezone import timezone
from rapidkit_framework.exceptions import AppException
from rapidkit_policy_engine import TemplateContext, resolve_template_value

from plugin_permission.cache import PolicyLike
from plugin_permission.status_codes import RbacStatusCode

logger = get_plugin_logger("Permission")

_OPERATORS: dict[str, Callable] = {
    "eq": lambda a, b: a == b,
    "ne": lambda a, b: a != b,
    "gt": lambda a, b: a > b,
    "ge": lambda a, b: a >= b,
    "lt": lambda a, b: a < b,
    "le": lambda a, b: a <= b,
    "in": lambda a, b: a in b if isinstance(b, list) else False,
    "not_in": lambda a, b: a not in b if isinstance(b, list) else True,
    "is_null": lambda a, _: a is None,
    "is_not_null": lambda a, _: a is not None,
}


def _evaluate_condition(rule: dict, obj_attrs: dict, ctx: TemplateContext) -> bool:
    """Evaluate a single condition node against object attributes."""
    rule_type = rule.get("type")

    if rule_type == "condition":
        field_name = rule.get("field", "")
        operator = rule.get("operator", "")
        raw_value = rule.get("value")

        obj_value = obj_attrs.get(field_name)

        # Resolve template variables
        if isinstance(raw_value, str):
            resolved = resolve_template_value(raw_value, ctx)
        else:
            resolved = raw_value

        op_func = _OPERATORS.get(operator)
        if op_func is None:
            return False

        return op_func(obj_value, resolved)

    elif rule_type == "group":
        logic = rule.get("logic", "AND").upper()
        conditions = rule.get("conditions", [])

        if logic == "AND":
            return all(_evaluate_condition(c, obj_attrs, ctx) for c in conditions)
        else:  # OR
            return any(_evaluate_condition(c, obj_attrs, ctx) for c in conditions)

    return False


def evaluate_create_permission(
    obj_attrs: dict,
    policies: list[PolicyLike],
    user: UserProtocol,
) -> None:
    """
    Evaluate whether a create operation is permitted by data policies.

    Raises AppException if denied.

    Logic:
    - If no policies: allow (no restrictions)
    - Filter to write-applicable policies only
    - Deny policies: if any deny matches new object attrs -> reject
    - Allow policies: if none match new object attrs -> reject
    """
    if not policies:
        return

    now = timezone.now()
    ctx = TemplateContext(user=user, now=now)

    # Filter to write-applicable policies
    write_policies = [p for p in policies if "write" in p.actions]
    if not write_policies:
        return

    allow_policies = [p for p in write_policies if p.effect == "allow"]
    deny_policies = [p for p in write_policies if p.effect == "deny"]

    # Check deny first (deny-overrides)
    for policy in deny_policies:
        if policy.rule and _evaluate_condition(policy.rule, obj_attrs, ctx):
            logger.warning(
                "Create denied by deny policy: policy={policy} user_id={user_id}",
                policy=policy.name,
                user_id=str(user.id),
            )
            raise AppException(RbacStatusCode.CREATE_PERMISSION_DENIED)

    # Check allow: at least one must match
    if allow_policies:
        any_allows = any(
            _evaluate_condition(p.rule, obj_attrs, ctx)
            for p in allow_policies
            if p.rule
        )
        if not any_allows:
            logger.warning(
                "Create denied: no allow policy matched user_id={user_id}",
                user_id=str(user.id),
            )
            raise AppException(RbacStatusCode.CREATE_PERMISSION_DENIED)
