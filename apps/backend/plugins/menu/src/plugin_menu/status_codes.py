"""
Menu plugin status codes (plugin_id=06).

6-digit format: 06TNNN
"""

from rapidkit_framework.status_codes import BaseStatusCode


class MenuStatusCode(BaseStatusCode):
    """Menu plugin error codes."""

    ACTIVE_MENU_INVALID_SOURCE = (62001, "menu.error.activeMenuInvalidSource")
    ACTIVE_MENU_NOT_ANCESTOR = (62002, "menu.error.activeMenuNotAncestor")
    ACTIVE_MENU_TARGET_UNAVAILABLE = (62003, "menu.error.activeMenuTargetUnavailable")
    REFERENCED_TARGET_CONFLICT = (63001, "menu.error.referencedTargetConflict")
    MOVE_INVALIDATES_BINDING = (63002, "menu.error.moveInvalidatesBinding")
    ACTIVE_MENU_TARGET_NOT_FOUND = (65001, "menu.error.activeMenuTargetNotFound")
