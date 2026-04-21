"""
数据规则 Schema。

Author : Coke
Date   : 2026-04-20
"""

from pydantic import Field as PydanticField
from rapidkit_common.schemas.base import BaseModel
from rapidkit_common.schemas.response import BaseSchema


class DataRuleResponse(BaseSchema):
    """数据规则响应。"""

    name: str
    model_name: str
    field: str
    operator: str
    value: str
    logic: str


class DataRuleCreate(BaseModel):
    """创建数据规则请求。"""

    name: str = PydanticField(max_length=100)
    model_name: str = PydanticField(max_length=100)
    field: str = PydanticField(max_length=100)
    operator: str = PydanticField(max_length=20)
    value: str = PydanticField(max_length=500)
    logic: str = PydanticField("AND", max_length=3)


class DataRuleUpdate(BaseModel):
    """更新数据规则请求。"""

    name: str | None = PydanticField(None, max_length=100)
    model_name: str | None = PydanticField(None, max_length=100)
    field: str | None = PydanticField(None, max_length=100)
    operator: str | None = PydanticField(None, max_length=20)
    value: str | None = PydanticField(None, max_length=500)
    logic: str | None = PydanticField(None, max_length=3)
