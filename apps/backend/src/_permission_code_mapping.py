# apps/backend/src/_permission_code_mapping.py
"""迁移命令使用的旧码 → 新码对照表（定义见 plugin_permission.legacy_routes）。"""

from plugin_permission.legacy_routes import LEGACY_BUTTON_CODES, LEGACY_MENU_CODES

__all__ = ["LEGACY_BUTTON_CODES", "LEGACY_MENU_CODES"]
