"""
系统领域数据模型。

Author : Coke
Date   : 2026-04-10
"""

from sqlmodel import JSON, Column, Field

from rapidkit_common.models import SQLModel


class ActivityLog(SQLModel, table=True):
    """系统活动日志。"""

    __tablename__ = "system_activity_logs"

    event_type: str = Field(max_length=50, index=True, description="事件类型")
    params: dict = Field(
        default_factory=dict,
        sa_column=Column(JSON, nullable=False, default={}),
        description="事件参数",
    )
    detail: str | None = Field(default=None, max_length=1024, description="事件详情")
    source_ip: str | None = Field(default=None, max_length=45, description="来源 IP")
