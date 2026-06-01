"""
Template variable resolution for data policy rules.

Author : Coke
Date   : 2026-04-30
"""

import re
from dataclasses import dataclass, field
from datetime import date, datetime
from uuid import UUID

from rapidkit_policy_engine.types import PolicyUser

_TEMPLATE_PATTERN = re.compile(r"^\$\{(.+)\}$")


@dataclass
class TemplateContext:
    """Holds resolved template variables for a single request."""

    user: PolicyUser
    now: datetime
    today: date | None = None
    _dept_ids: list[UUID] | None = field(default=None, init=False, repr=False)

    def __post_init__(self):
        if self.today is None:
            self.today = self.now.date()

    @property
    def user_id(self) -> UUID:
        return self.user.id

    @property
    def dept_id(self) -> UUID | None:
        return self.user.department_id

    @property
    def dept_ids(self) -> list[UUID] | None:
        return self._dept_ids

    @dept_ids.setter
    def dept_ids(self, value: list[UUID]) -> None:
        self._dept_ids = value

    @property
    def roles(self) -> list[str]:
        return self.user.roles


def resolve_template_value(value: str, ctx: TemplateContext) -> str | list | datetime | date | None:
    """
    Resolve a template variable string into a concrete value.
    Returns None if the variable is unknown or unresolvable.
    """
    match = _TEMPLATE_PATTERN.match(value.strip())
    if not match:
        return value

    var_name = match.group(1)

    resolvers: dict = {
        "user.id": lambda: str(ctx.user_id),
        "user.dept_id": lambda: str(ctx.dept_id) if ctx.dept_id else None,
        "user.dept_ids": lambda: [str(d) for d in ctx.dept_ids] if ctx.dept_ids else None,
        "user.roles": lambda: ctx.roles,
        "now": lambda: ctx.now,
        "today": lambda: ctx.today,
    }

    resolver = resolvers.get(var_name)
    if resolver is not None:
        return resolver()

    # Fallback to plugin registry (lazy import to avoid circular dependency)
    from rapidkit_policy_engine.template_registry import resolve_from_registry

    found, registry_value = resolve_from_registry(var_name, ctx)
    if found:
        return registry_value

    return None
