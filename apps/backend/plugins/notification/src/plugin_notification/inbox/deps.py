"""通知插件 —— 依赖注入。"""

from typing import Annotated

from fastapi import Depends
from rapidkit_common.deps import SessionDep

from plugin_notification.crud import UserNotificationCRUD


def get_inbox_crud(session: SessionDep) -> UserNotificationCRUD:
    """复用请求数据库会话创建收件箱 CRUD。"""
    return UserNotificationCRUD(session)


InboxCrudDep = Annotated[UserNotificationCRUD, Depends(get_inbox_crud)]
