"""
数据规则模型。

Author : Coke
Date   : 2026-04-20
"""

from rapidkit_common.models import SQLModel
from sqlmodel import Field


class DataRule(SQLModel, table=True):
    """自定义数据过滤规则。"""

    __tablename__ = "auth_data_rules"

    name: str = Field(max_length=100, description="规则名称")
    model_name: str = Field(max_length=100, description="目标表名或模型名")
    field: str = Field(max_length=100, description="过滤字段名")
    operator: str = Field(max_length=20, description="操作符：eq/ne/gt/ge/lt/le/in/not_in")
    value: str = Field(max_length=500, description="值，支持模板变量 ${user_id} ${dept_id}")
    logic: str = Field(default="AND", max_length=3, description="逻辑：AND/OR")
