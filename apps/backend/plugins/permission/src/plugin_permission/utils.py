"""
RBAC plugin utilities.

Author : Coke
Date   : 2026-05-11
"""

from collections.abc import Iterable


def build_route_key(methods: Iterable[str], path: str) -> str:
    """Canonical route key format. Used by sync, schema code, and RBAC check."""
    return f"{':'.join(sorted(methods))}:{path}"
