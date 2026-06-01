"""
RapidKit Policy Engine — resolves JSON rule trees into SQLAlchemy WHERE clauses.
"""

from rapidkit_policy_engine.engine import resolve_rule_tree
from rapidkit_policy_engine.rule_types import ConditionNode, GroupNode, RuleNode, SubqueryNode, parse_rule
from rapidkit_policy_engine.template import TemplateContext, resolve_template_value
from rapidkit_policy_engine.template_registry import get_registered_vars, register_template_var
from rapidkit_policy_engine.types import PolicyUser

__all__ = [
    "resolve_rule_tree",
    "ConditionNode",
    "GroupNode",
    "SubqueryNode",
    "RuleNode",
    "parse_rule",
    "TemplateContext",
    "resolve_template_value",
    "register_template_var",
    "get_registered_vars",
    "PolicyUser",
]
