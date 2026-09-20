"""
用户偏好 —— 依赖注入。

Author : Coke
Date   : 2026-09-04
"""

from typing import Annotated

from fastapi import Depends
from rapidkit_common.deps import SessionDep

from plugin_notification.crud import PreferenceCRUD


def get_preference_crud(session: SessionDep) -> PreferenceCRUD:
    """Build preference CRUD in the request transaction."""
    return PreferenceCRUD(session)


PreferenceCrudDep = Annotated[PreferenceCRUD, Depends(get_preference_crud)]
