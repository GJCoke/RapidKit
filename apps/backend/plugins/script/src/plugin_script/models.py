"""
Script domain database models.

Author  : Coke
Date    : 2026-03-31
"""

from uuid import UUID

from rapidkit_common.enums import Status
from rapidkit_common.models import SQLModel
from sqlmodel import Column, Field, Text


class Script(SQLModel, table=True):
    """脚本模型"""

    __tablename__ = "script_scripts"

    name: str = Field(..., unique=True, max_length=255, description="脚本名称")
    description: str = Field("", max_length=500, description="脚本描述")
    language: str = Field(..., max_length=50, description="语言标识（python / javascript / shell）")
    code: str = Field("", sa_column=Column(Text), description="代码内容")
    status: Status = Field(Status.ON, description="启用 / 禁用")


class ScriptExecution(SQLModel, table=True):
    """脚本执行审计记录"""

    __tablename__ = "script_executions"

    script_id: UUID = Field(..., index=True, description="关联脚本 ID")
    executor_id: UUID = Field(..., index=True, description="执行人 ID")
    language: str = Field(..., max_length=50, description="执行语言")
    code: str = Field("", sa_column=Column(Text), description="执行时的代码快照")
    stdout: str | None = Field(default=None, sa_column=Column(Text), description="标准输出")
    stderr: str | None = Field(default=None, sa_column=Column(Text), description="错误输出")
    exit_code: int = Field(0, description="退出码")
    runtime: float = Field(0.0, description="执行耗时（秒）")
