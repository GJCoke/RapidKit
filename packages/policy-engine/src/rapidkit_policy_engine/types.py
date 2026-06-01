"""
Minimal type protocols for the policy engine.

These protocols allow the engine to remain dependency-free while
still providing type safety for callers.
"""

from typing import Protocol
from uuid import UUID


class PolicyUser(Protocol):
    """Minimal user interface required by the policy engine."""

    id: UUID
    is_admin: bool
    roles: list[str]
    department_id: UUID | None
