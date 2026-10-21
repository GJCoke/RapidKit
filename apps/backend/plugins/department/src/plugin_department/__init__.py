"""
Department plugin — organizational hierarchy management.

Author : Coke
Date   : 2026-05-11
"""

from rapidkit_common.protocols.department import DepartmentResolver
from rapidkit_framework.plugin import PluginManifest
from rapidkit_framework.services import ServiceRegistry

from plugin_department.permissions import PERMISSION_CODES, PERMISSION_PACKAGES, RESOURCES
from plugin_department.providers import DepartmentResolverImpl


def register() -> PluginManifest:
    from plugin_department.api import router
    from plugin_department.audit import configure_audit
    from plugin_department.models import Department

    def register_services(registry: ServiceRegistry) -> None:
        registry.register(DepartmentResolver, DepartmentResolverImpl())

    return PluginManifest(
        name="department",
        version="0.1.0",
        resources=RESOURCES,
        permission_codes=PERMISSION_CODES,
        permission_packages=PERMISSION_PACKAGES,
        router=router,
        audit_actions=configure_audit(router),
        models=[Department],
        provides=[DepartmentResolver],
        service_factories={DepartmentResolver: register_services},
    )
