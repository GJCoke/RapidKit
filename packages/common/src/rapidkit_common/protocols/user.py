"""User domain protocols."""

from typing import Protocol, runtime_checkable
from uuid import UUID


@runtime_checkable
class UserProtocol(Protocol):
    """Minimal user interface visible across plugins."""

    id: UUID
    username: str
    email: str
    name: str
    status: int
    is_admin: bool
    roles: list[str]
    department_id: UUID | None
    password: bytes


class UserResolver(Protocol):
    """Resolve users by identity fields. Provided by plugin_user."""

    async def get_by_id(self, user_id: UUID) -> UserProtocol | None: ...
    async def get_by_username(self, username: str) -> UserProtocol | None: ...


class UserQueryService(Protocol):
    """Query users by relationships. Provided by plugin_user."""

    async def get_active_user_ids(self, user_ids: list[UUID]) -> list[UUID]: ...
    async def get_active_user_ids_by_role(self, role_code: str) -> list[UUID]: ...
    async def get_active_user_ids_by_department(
        self,
        dept_id: UUID,
        include_descendants: bool = False,
    ) -> list[UUID]: ...
    async def get_all_active_user_ids(self) -> list[UUID]: ...
