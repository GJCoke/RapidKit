"""
Schedule plugin — 定时任务管理。

Author  : Claude
Date    : 2026-04-01
"""

from rapidkit_framework.plugin import PluginManifest

from plugin_schedule.permissions import PERMISSION_CODES, PERMISSION_PACKAGES, RESOURCES


def register() -> PluginManifest:
    from plugin_schedule.api import router
    from plugin_schedule.models import CrontabSchedule, IntervalSchedule, PeriodicTask, SolarSchedule

    return PluginManifest(
        name="schedule",
        version="0.1.0",
        resources=RESOURCES,
        permission_codes=PERMISSION_CODES,
        permission_packages=PERMISSION_PACKAGES,
        router=router,
        models=[IntervalSchedule, CrontabSchedule, SolarSchedule, PeriodicTask],
    )
