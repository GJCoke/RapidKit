"""
审计字典请求/响应模型。

Author : Coke
Date   : 2026-04-20
"""

from rapidkit_common.schemas.base import BaseModel
from rapidkit_common.schemas.response import BaseSchema


class AuditDictResponse(BaseSchema):
    """审计字典响应。"""

    key: str
    category: str
    label_zh: str
    label_en: str


class AuditDictCreate(BaseModel):
    """审计字典新增请求。"""

    key: str
    category: str
    label_zh: str
    label_en: str


class AuditDictUpdate(BaseModel):
    """审计字典修改请求。"""

    key: str | None = None
    category: str | None = None
    label_zh: str | None = None
    label_en: str | None = None
