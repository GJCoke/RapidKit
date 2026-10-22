from fastapi import Depends
from rapidkit_common.deps import SessionDep
from typing_extensions import Annotated, Doc

from plugin_system.activity.crud import ActivityEventCRUD


async def get_activity_event_crud(session: SessionDep) -> ActivityEventCRUD:
    """Provide curated activity data access."""
    return ActivityEventCRUD(session)


ActivityEventCrudDep = Annotated[
    ActivityEventCRUD,
    Depends(get_activity_event_crud),
    Doc("Curated dashboard activity data access."),
]
