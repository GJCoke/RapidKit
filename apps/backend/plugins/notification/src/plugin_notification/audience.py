"""受众解析：把规则展开为去重且保序的用户 ID 列表。"""

from uuid import UUID

from rapidkit_common.protocols.notification import AudienceRule
from rapidkit_common.protocols.user import UserQueryService
from rapidkit_core.log import get_plugin_logger
from rapidkit_framework.exceptions import AppException

from plugin_notification.status_codes import NotificationStatusCode

logger = get_plugin_logger("Notification")


class AudienceResolver:
    """Resolve audience rules through the user plugin's public query contract."""

    def __init__(self, query_service: UserQueryService):
        self._query_service = query_service

    async def resolve(self, rules: list[AudienceRule]) -> list[UUID]:
        """Resolve user, role, department, and all-user rules into unique IDs."""
        seen: set[UUID] = set()
        user_ids: list[UUID] = []

        def add_user_id(user_id: UUID) -> None:
            if user_id not in seen:
                seen.add(user_id)
                user_ids.append(user_id)

        for rule in rules:
            if rule.type == "user":
                if rule.value:
                    add_user_id(UUID(rule.value))
            elif rule.type == "role":
                if rule.value:
                    users = await self._query_service.get_users_by_role(rule.value)
                    for user in users:
                        add_user_id(user.id)
            elif rule.type == "department":
                if rule.value:
                    users = await self._query_service.get_users_by_department(UUID(rule.value))
                    for user in users:
                        add_user_id(user.id)
            elif rule.type == "all":
                for user_id in await self._query_service.get_all_active_user_ids():
                    add_user_id(user_id)
            else:
                logger.warning("Unknown audience type: {}", rule.type)
                raise AppException(NotificationStatusCode.INVALID_AUDIENCE_TYPE)

        return user_ids
