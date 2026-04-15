"""
Script 插件 — 脚本管理与执行。

Author : Coke
Date   : 2026-04-14
"""

from rapidkit_core.plugin import PluginManifest

from plugin_script.models import Script, ScriptExecution


def register() -> PluginManifest:
    """注册 Script 插件。"""
    from plugin_script.api import router

    return PluginManifest(
        name="script",
        version="0.1.0",
        router=router,
        models=[Script, ScriptExecution],
    )
