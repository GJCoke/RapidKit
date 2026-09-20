"""
PreferenceResolver：按「用户 + 分类」过滤非强制消息。

规则：
- mandatory=True：全量放行。
- 分类不可关闭或为保留分类：全量放行。
- 其他分类剔除显式 enabled=False 的用户；未配置者默认接收。

过滤只发生在新消息写扩散前，历史收件箱不受影响。
"""

from uuid import UUID

from rapidkit_core.log import get_plugin_logger
from sqlmodel.ext.asyncio.session import AsyncSession

from plugin_notification.categories import CategoryRegistry, default_registry
from plugin_notification.crud import PreferenceCRUD

logger = get_plugin_logger("Notification")


class PreferenceResolver:
    """Resolve the recipients allowed by persisted notification preferences."""

    def __init__(
        self,
        session: AsyncSession | None = None,
        registry: CategoryRegistry | None = None,
    ) -> None:
        self._session = session
        self._registry = registry or default_registry()

    async def filter_allowed(
        self,
        user_ids: list[UUID],
        *,
        category: str,
        mandatory: bool,
    ) -> list[UUID]:
        """Filter only explicit opt-outs while preserving input order."""
        if mandatory or not user_ids:
            return list(user_ids)

        definition = self._registry.get(category)
        if definition.reserved or not definition.closable:
            return list(user_ids)
        if self._session is None:
            return list(user_ids)

        disabled = await PreferenceCRUD(self._session).get_disabled_user_ids(
            category,
            list(user_ids),
        )
        if disabled:
            logger.debug(
                "Preference filtered {} users for category={}",
                len(disabled),
                category,
            )
        return [user_id for user_id in user_ids if user_id not in disabled]
