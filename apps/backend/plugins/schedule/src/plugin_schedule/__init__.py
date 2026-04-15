"""
Schedule plugin — 定时任务管理。

Author  : Claude
Date    : 2026-04-01
"""

from rapidkit_core.plugin import PluginManifest


def register() -> PluginManifest:
    from plugin_schedule.api import router

    from plugin_schedule.models import CrontabSchedule, IntervalSchedule, PeriodicTask, SolarSchedule

    return PluginManifest(
        name="schedule",
        version="0.1.0",
        router=router,
        models=[IntervalSchedule, CrontabSchedule, SolarSchedule, PeriodicTask],
    )
