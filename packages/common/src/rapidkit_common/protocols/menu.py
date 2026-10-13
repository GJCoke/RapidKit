"""Read-only menu navigation contracts, independent of the menu ORM."""

from typing import Literal, Protocol
from uuid import UUID

from pydantic import Field
from sqlmodel.ext.asyncio.session import AsyncSession

from rapidkit_common.auth import UserProtocol
from rapidkit_common.schemas.base import BaseModel


class ActionParameter(BaseModel):
    name: str
    location: Literal["path", "query"]
    required: bool
    default_value: str | None = None
    description_key: str | None = None
    example: str | None = None


class ActionTarget(BaseModel):
    menu_id: UUID
    label: str
    breadcrumb: list[str]
    route: str
    path: str
    parameters: list[ActionParameter] = Field(default_factory=list)


class MenuNavigationProvider(Protocol):
    async def list_targets(self, session: AsyncSession, user: UserProtocol) -> list[ActionTarget]: ...

    async def get_target(
        self, session: AsyncSession, menu_id: UUID, user: UserProtocol | None = None
    ) -> ActionTarget | None:
        """Return an enabled target; supplying a user also enforces authorization."""
        ...
