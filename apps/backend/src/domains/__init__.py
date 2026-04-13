"""
Domain models export for Alembic discovery.
"""

from src.domains.auth.models import User
from src.domains.menu.models import Menu
from src.domains.monitoring.models import ApiMetricsHourly
from src.domains.role.models import Role
from src.domains.router.models import InterfaceRouter
from src.domains.script.models import Script, ScriptExecution
from src.domains.system.models import ActivityLog
from src.domains.worker.models import CeleryTaskResult, CeleryWorker

__all__ = [
    "User",
    "Role",
    "Menu",
    "InterfaceRouter",
    "CeleryWorker",
    "CeleryTaskResult",
    "Script",
    "ScriptExecution",
    "ActivityLog",
    "ApiMetricsHourly",
]
