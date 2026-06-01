"""
RBAC configuration.

Author : Coke
Date   : 2026-05-11
"""

from datetime import timedelta

from rapidkit_core.config import BaseSettings


class RBACConfig(BaseSettings):
    """RBAC-specific configuration."""

    POLICY_CACHE_TTL: timedelta = timedelta(hours=4)
    PERMISSION_CACHE_TTL: timedelta = timedelta(days=1)

    model_config = {"env_prefix": "RBAC_", "extra": "ignore"}


rbac_config = RBACConfig()
