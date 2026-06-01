"""
Testing utilities for plugins using ServiceRegistry.

Author : Coke
Date   : 2026-05-11
"""

from rapidkit_framework.services import ServiceRegistry


def create_test_registry() -> ServiceRegistry:
    """Create a fresh, isolated ServiceRegistry for testing."""
    return ServiceRegistry()
