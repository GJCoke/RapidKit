"""
Script domain schemas.

Author  : Claude
Date    : 2026-03-31
"""

from datetime import datetime
from uuid import UUID

from pydantic import Field

from src.common.schemas import BaseModel, BaseRequest
from src.common.schemas.request import BatchRequest, PaginatedRequest
from src.common.schemas.response import BaseSchema, ResponseSchema
from src.utils.enums import Status

# ==================== Script Schemas ====================


class ScriptSchema(BaseModel):
    """Script 共享字段。"""

    name: str
    description: str = ""
    language: str
    code: str = ""
    status: Status = Status.ON


class ScriptResponse(ScriptSchema, ResponseSchema):
    """Script 详情响应（含 code）。"""


class ScriptListResponse(BaseSchema):
    """Script 列表响应（不含 code 大字段）。"""

    name: str
    description: str
    language: str
    status: Status
    create_time: datetime
    update_time: datetime


class ScriptCreate(ScriptSchema, BaseRequest):
    """创建 Script 数据结构。"""


class ScriptUpdate(ScriptSchema, BaseRequest):
    """更新 Script 数据结构。"""


# ==================== Query Schemas ====================


class ScriptQueriesSchema(BaseModel):
    """Script 查询字段。"""

    keyword: str = ""
    status: Status | None = Field(None, description="状态筛选")
    language: str | None = Field(None, description="语言筛选")


class ScriptPageQuery(ScriptQueriesSchema, PaginatedRequest):
    """Script 分页查询请求。"""


class ScriptBatchBody(BatchRequest):
    """Script 批量操作请求。"""


# ==================== Execution Schemas ====================


class ScriptExecuteResponse(BaseModel):
    """脚本执行结果响应。"""

    stdout: str | None = None
    stderr: str | None = None
    exit_code: int = 0
    runtime: float = 0.0


class ScriptExecutionResponse(BaseSchema):
    """脚本执行审计记录响应。"""

    script_id: UUID
    executor_id: UUID
    language: str
    code: str
    stdout: str | None = None
    stderr: str | None = None
    exit_code: int
    runtime: float


class ScriptExecutionPageQuery(PaginatedRequest):
    """脚本执行历史分页查询。"""
