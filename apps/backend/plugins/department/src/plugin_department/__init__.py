"""
Department plugin — organizational hierarchy management.

Author : Coke
Date   : 2026-05-11
"""

from rapidkit_framework.plugin import PluginManifest


def register() -> PluginManifest:
    from plugin_department.api import router
    from plugin_department.models import Department

    return PluginManifest(
        name="department",
        version="0.1.0",
        router=router,
        models=[Department],
    )
