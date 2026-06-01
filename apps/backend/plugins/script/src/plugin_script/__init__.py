"""
Script 插件 — 脚本管理与执行。

Author : Coke
Date   : 2026-04-14
"""

from rapidkit_framework.plugin import PluginManifest


def register() -> PluginManifest:
    """注册 Script 插件。"""
    from plugin_script.api import router
    from plugin_script.models import Script, ScriptExecution

    return PluginManifest(
        name="script",
        version="0.1.0",
        router=router,
        models=[Script, ScriptExecution],
    )
