"""
请求模型数据结构。

Author : Coke
Date   : 2025-03-24
"""

from uuid import UUID

from pydantic import Field

from .base import BaseModel


class BaseRequest(BaseModel):
    """基础请求模型。"""


class UserAgent(BaseModel):
    """统一用户代理请求。"""

    user_agent: str = Field(..., description="用户代理字符串。")
    device: str = Field(..., description="设备信息字符串。")
    os: str = Field(..., description="操作系统信息字符串。")
    browser: str = Field(..., description="浏览器信息字符串。")


class PaginatedRequest(BaseRequest):
    """统一分页请求。"""

    page: int = Field(1, description="当前页码。")
    page_size: int = Field(10, description="每页条数。")


class SearchRequest(BaseRequest):
    """统一搜索请求。"""

    keyword: str = Field(..., description="搜索关键词。")


class DeleteRequest(BaseRequest):
    """统一删除请求。"""

    id: UUID = Field(..., description="要删除的项 id。")


class DetailsRequest(BaseRequest):
    """统一详情请求。"""

    id: UUID = Field(..., description="要获取详情的项 id。")


class BatchRequest(BaseRequest):
    """统一批量请求。"""

    ids: list[UUID] = Field(..., description="项 id 列表。")
