"""
Pluggable template variable registry for the data policy engine.

Allows plugins to register custom template variables (e.g. ${user.org_id})
that are resolved during policy rule evaluation.

Author : Coke
Date   : 2026-05-06
"""

import logging
from typing import Any, Callable

from rapidkit_policy_engine.template import TemplateContext

logger = logging.getLogger("rapidkit_policy_engine")

TemplateResolver = Callable[[TemplateContext], Any]

_template_resolvers: dict[str, tuple[TemplateResolver, str]] = {}


def register_template_var(name: str, resolver: TemplateResolver, description: str = "") -> None:
    """
    Register a custom template variable resolver.

    Args:
        name: Variable path without ${}, e.g. "user.org_id" for ${user.org_id}
        resolver: Function that takes TemplateContext and returns the resolved value
        description: i18n key or description text for frontend display
    """
    _template_resolvers[name] = (resolver, description)


def unregister_template_var(name: str) -> None:
    """Remove a registered template variable."""
    _template_resolvers.pop(name, None)


def get_registered_var_names() -> list[str]:
    """Return all registered variable names (for frontend autocomplete)."""
    return list(_template_resolvers.keys())


def get_registered_vars() -> list[tuple[str, str]]:
    """Return all registered variable names with descriptions."""
    return [(name, desc) for name, (_, desc) in _template_resolvers.items()]


def resolve_from_registry(var_name: str, ctx: TemplateContext) -> tuple[bool, Any]:
    """
    Attempt to resolve a variable from the registry.

    Returns:
        (found, value) tuple. If found=False, value is None.
    """
    entry = _template_resolvers.get(var_name)
    if entry is None:
        return False, None
    resolver, _ = entry
    try:
        return True, resolver(ctx)
    except Exception as e:
        logger.warning("Template resolver failed for variable '%s': %s", var_name, e)
        return False, None
