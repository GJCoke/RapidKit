"""
通配符审计事件处理器。

Author : Coke
Date   : 2026-05-12
"""

from dataclasses import fields as dc_fields

from rapidkit_core.database import AsyncSessionLocal
from rapidkit_core.log import get_plugin_logger
from rapidkit_framework.events import Event

logger = get_plugin_logger("System")


async def audit_event_handler(event: Event) -> None:
    """通配符审计 -- 所有事件自动记录为 ActivityLog。"""
    from plugin_system.models import ActivityLog

    params = {f.name: str(getattr(event, f.name)) for f in dc_fields(event) if f.name != "event_name"}

    async with AsyncSessionLocal() as session:
        log = ActivityLog(
            event_type=event.event_name,
            params=params,
        )
        session.add(log)
        await session.commit()

    logger.debug("Audit recorded: {event_name}", event_name=event.event_name)
