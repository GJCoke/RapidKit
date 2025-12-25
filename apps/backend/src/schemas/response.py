"""
响应模型数据结构。

Author : Coke
Date   : 2025-03-12
"""

from datetime import datetime
from typing import Any, Generic, TypeVar
from uuid import UUID

from fastapi import status
from pydantic import ConfigDict, Field, field_serializer

from src.locales.i18n import is_i18n_key, t
from src.schemas import BaseModel

T = TypeVar("T")


class BaseResponse(BaseModel):
    """基础响应模型。"""

    model_config = ConfigDict(**(BaseModel.model_config or {}), from_attributes=True)


class BaseSchema(BaseResponse):
    id: UUID

    create_time: datetime = Field(examples=["2024-07-31 16:07:34"])
    update_time: datetime = Field(examples=["2024-07-31 16:07:34"])

    @field_serializer("create_time", "update_time")
    def serialize_datetime(self, value: datetime) -> str:
        """
        Pydantic 用于 datetime 字段的序列化方法。

        序列化为 GMT 字符串格式。

        Args:
            value: 要序列化的 datetime 值

        Returns:
            GMT 格式字符串
        """
        return value.strftime("%Y-%m-%d %H:%M:%S")


class ResponseSchema(BaseSchema):
    """响应数据结构。"""

    id: UUID


class Response(BaseResponse, Generic[T]):
    """
    统一响应结构。

    Example:
        @router.get("/user")
        def user() -> Response[UserInfo]:
            pass
    """

    code: int = Field(status.HTTP_200_OK, description="状态码。")
    message: str = Field("common.response.success", description="响应消息。")
    data: T | None = Field(None, description="响应数据。")

    def __init__(
        self,
        /,
        code: int | None = None,
        message: str | None = None,
        data: T | None = None,
        **kwargs: Any,
    ):
        payload = {k: v for k, v in dict(code=code, message=message, data=data).items() if v is not None}
        payload = {**payload, **kwargs}
        super().__init__(**payload)

    @field_serializer("message")
    def serialize_message(self, value: str) -> str:
        """
        Pydantic 用于 message 字段的序列化方法。

        Args:
            value: 要序列化的 message 值

        Returns:
            序列化后的 message 字符串
        """
        # 判断是否为 i18n key（包含 "."，如 "common.response.success"）
        # 虽然 t() 未找到 key 时也会返回原始值，但通过先检查 "." 可以避免不必要的翻译字典查询，提高效率
        # 特别是在大量错误响应场景下，这个简单的字符串检查比翻译查询更快
        return t(value) if is_i18n_key(value) else value  # ty:ignore[invalid-argument-type]


class PaginatedResponse(BaseResponse, Generic[T]):
    """
    统一分页响应结构。

    Example:
            @router.get("/user")
            def user() -> Response[PaginatedResponse[UserInfo]]:
                    pass

            {
                "code": 200,
                "message": "Successful.",
                "data": {
                    "page": 1,
                    "pageSize": 20,
                    "total": 100,
                    "records": []
                }
            }
    """

    page: int = Field(..., description="页码。")
    page_size: int = Field(..., description="每页条数。")
    total: int = Field(..., description="总条数。")
    records: list[T] = Field(..., description="记录列表。")


class BadRequestResponse(Response):
    """统一错误请求响应。"""

    code: int = status.HTTP_400_BAD_REQUEST
    message: str = "common.response.badRequest"
    data: None = None


class AuthenticationError(Response):
    """认证错误响应。"""

    code: int = status.HTTP_401_UNAUTHORIZED
    message: str = "common.response.unauthorized"
    data: None = None


class PermissionResponse(Response):
    """统一权限响应。"""

    code: int = status.HTTP_403_FORBIDDEN
    message: str = "common.response.permissionDenied"
    data: None = None


class NotFoundResponse(Response):
    """统一未找到响应。"""

    code: int = status.HTTP_404_NOT_FOUND
    message: str = "common.response.notFound"
    data: None = None


class ValidationErrorResponse(Response):
    """统一参数校验失败响应。"""

    code: int = status.HTTP_422_UNPROCESSABLE_CONTENT
    message: str = "common.response.invalidParameter"
    data: str = "Validation error details."


class ServerErrorResponse(Response):
    """统一服务器错误响应。"""

    code: int = status.HTTP_500_INTERNAL_SERVER_ERROR
    message: str = "common.response.internalServer"
    data: str = "Internal server error details."


class SocketErrorResponse(Response):
    """统一 websocket 服务器错误响应。"""

    code: int = status.WS_1011_INTERNAL_ERROR
    message: str = "common.response.internalServer"
    event: str
    data: str = "Internal server error details."


RESPONSES = {
    400: {"description": "Bad Request.", "model": BadRequestResponse},
    401: {"description": "Unauthorized.", "model": AuthenticationError},
    403: {"description": "Permission denied.", "model": PermissionResponse},
    404: {"description": "Not found.", "model": NotFoundResponse},
    422: {"description": "Unprocessable Entity.", "model": ValidationErrorResponse},
    500: {"description": "Internal Server Error.", "model": ServerErrorResponse},
}
