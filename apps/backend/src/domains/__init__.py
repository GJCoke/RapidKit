"""
Domain models export for Alembic discovery.
"""

from src.domains.auth.models import User
from src.domains.menu.models import Menu
from src.domains.role.models import Role
from src.domains.router.models import InterfaceRouter

__all__ = ["User", "Role", "Menu", "InterfaceRouter"]
