"""Department domain protocols."""

from typing import Protocol
from uuid import UUID


class DepartmentResolver(Protocol):
    """Resolve department hierarchy. Provided by plugin_department."""

    async def get_by_id(self, dept_id: UUID) -> object | None: ...
    async def get_children_ids(self, dept_id: UUID) -> list[UUID]: ...
    async def get_ancestor_ids(self, dept_id: UUID) -> list[UUID]: ...
