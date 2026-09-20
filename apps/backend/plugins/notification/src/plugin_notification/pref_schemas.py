"""
用户偏好 —— 请求/响应 schema。

Author : Coke
Date   : 2026-09-04
"""

from pydantic import Field
from rapidkit_common.schemas.base import BaseModel
from rapidkit_common.schemas.request import BaseRequest


class PreferenceItemResponse(BaseModel):
    """One effective notification category preference."""

    category: str
    name_key: str
    enabled: bool
    closable: bool
    reserved: bool


class PreferenceUpdateRequest(BaseRequest):
    """Strict update payload that rejects truthy strings and integers."""

    enabled: bool = Field(strict=True)
