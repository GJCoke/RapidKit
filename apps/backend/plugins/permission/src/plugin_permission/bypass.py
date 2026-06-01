"""
Single source of truth for admin bypass logic.

Author : Coke
Date   : 2026-05-13
"""

from rapidkit_common.auth import UserProtocol


def is_permission_bypass(user: UserProtocol) -> bool:
    """Check if user should bypass all permission checks."""
    return user.is_admin
