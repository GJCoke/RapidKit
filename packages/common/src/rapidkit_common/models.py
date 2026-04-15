"""
Database Model Base Class with Timestamp Support.

Author : Coke
Date   : 2025-03-24
"""

from datetime import datetime
from uuid import UUID

from sqlmodel import Field
from sqlmodel import SQLModel as _SQLModel

from rapidkit_core.timezone import timezone
from rapidkit_core.uuid7 import uuid7


class SQLModel(_SQLModel):
    """
    结合 Pydantic 与 SQLAlchemy 功能的基础 SQLModel 类。

    继承自 BaseModel（自定义 Pydantic 模型）和 SQLModel（SQLAlchemy 模型），
    提供数据库模型的通用字段和序列化能力。
    """

    id: UUID = Field(
        default_factory=uuid7,
        primary_key=True,
        index=True,
        nullable=False,
        description="唯一ID",
    )
    create_time: datetime = Field(default_factory=timezone.now, description="创建时间")
    update_time: datetime = Field(
        default_factory=timezone.now,
        sa_column_kwargs={"onupdate": timezone.now},
        description="更新时间",
    )
