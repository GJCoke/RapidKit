"""
系统领域数据模型。

Author : Coke
Date   : 2026-04-10
"""

from uuid import UUID

from rapidkit_common.models import SQLModel
from sqlmodel import JSON, Column, Field


class ActivityLog(SQLModel, table=True):
    """操作审计日志。"""

    __tablename__ = "system_activity_logs"

    event_type: str = Field(max_length=50, index=True, description="事件类型")
    params: dict = Field(
        default_factory=dict,
        sa_column=Column(JSON, nullable=False, default={}),
        description="事件参数",
    )
    detail: str | None = Field(default=None, max_length=1024, description="事件详情")
    source_ip: str | None = Field(default=None, max_length=45, description="来源 IP")

    # 审计增强字段
    user_id: UUID | None = Field(default=None, index=True, description="操作用户 ID")
    username: str | None = Field(default=None, max_length=100, description="操作用户名")
    http_method: str | None = Field(default=None, max_length=10, description="HTTP 方法")
    path: str | None = Field(default=None, max_length=500, description="请求路径")
    user_agent: str | None = Field(default=None, max_length=500, description="User-Agent")
    request_body: dict | None = Field(
        default=None, sa_column=Column(JSON, nullable=True), description="请求体（脱敏后）"
    )
    response_code: int | None = Field(default=None, description="应用层响应 code")
