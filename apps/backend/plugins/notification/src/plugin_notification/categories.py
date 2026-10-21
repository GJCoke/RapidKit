"""通知分类注册表。"""

from dataclasses import dataclass

from rapidkit_core.log import get_plugin_logger

logger = get_plugin_logger("Notification")


@dataclass
class CategoryDef:
    """A stable notification category and its preference policy."""

    code: str
    name_key: str
    closable: bool = True
    reserved: bool = False


class CategoryRegistry:
    """Code-owned registry for categories exposed in user preferences."""

    def __init__(self) -> None:
        self._items: dict[str, CategoryDef] = {}

    def register(self, definition: CategoryDef) -> None:
        self._items[definition.code] = definition

    def get(self, code: str) -> CategoryDef:
        return self._items.get(
            code,
            CategoryDef(
                code=code,
                name_key=f"notification.category.{code}",
                closable=True,
                reserved=False,
            ),
        )

    def all(self) -> list[CategoryDef]:
        return list(self._items.values())


_BUILTIN: list[CategoryDef] = [
    CategoryDef(
        code="admin.announcement",
        name_key="notification.category.adminAnnouncement",
        closable=False,
        reserved=True,
    ),
    CategoryDef(
        code="system.security",
        name_key="notification.category.systemSecurity",
        closable=False,
        reserved=True,
    ),
    CategoryDef(code="user.invited", name_key="notification.category.userInvited"),
    CategoryDef(code="user.mention", name_key="notification.category.userMention"),
    CategoryDef(code="task.completed", name_key="notification.category.taskCompleted"),
]

_default: CategoryRegistry | None = None


def default_registry() -> CategoryRegistry:
    """Return the process-wide registry with built-in notification categories."""
    global _default
    if _default is None:
        registry = CategoryRegistry()
        for definition in _BUILTIN:
            registry.register(definition)
        _default = registry
    return _default
