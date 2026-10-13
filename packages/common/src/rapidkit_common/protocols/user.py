"""User domain protocols."""

from dataclasses import dataclass
from typing import Protocol, runtime_checkable
from uuid import UUID


@dataclass(frozen=True)
class UserPublicProfile:
    """Public recipient fields only; never contains credentials or ORM state."""

    id: UUID
    name: str = ""
    email: str = ""
    roles: str = ""
    department: str = ""


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


@dataclass(frozen=True)
class UserDisplayProfile:
    """Minimal directory identity for displaying historical records, including inactive users."""

    id: UUID
    name: str = ""
    username: str = ""
    avatar: str | None = None
    department: str = ""
    status: str = "1"


class UserResolver(Protocol):
    """Resolve users by identity fields. Provided by plugin_user."""

    async def get_by_id(self, user_id: UUID) -> UserProtocol | None: ...
    async def get_by_username(self, username: str) -> UserProtocol | None: ...


class UserQueryService(Protocol):
    """Query users by relationships. Provided by plugin_user."""

    async def get_public_profiles(self, user_ids: list[UUID]) -> dict[UUID, UserPublicProfile]: ...

    async def get_display_profiles(self, user_ids: list[UUID]) -> dict[UUID, UserDisplayProfile]: ...

    async def get_active_user_ids(self, user_ids: list[UUID]) -> list[UUID]: ...
    async def get_active_user_ids_by_role(self, role_code: str) -> list[UUID]: ...
    async def get_active_user_ids_by_department(
        self,
        dept_id: UUID,
        include_descendants: bool = False,
    ) -> list[UUID]: ...
    async def get_all_active_user_ids(self) -> list[UUID]: ...
