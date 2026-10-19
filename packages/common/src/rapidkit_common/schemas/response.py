"""
响应模型数据结构。

Author : Coke
Date   : 2025-03-12
"""

from typing import Any, Generic, Self, TypeVar
from uuid import UUID

from pydantic import (
    ConfigDict,
    Field,
    ModelWrapValidatorHandler,
    PrivateAttr,
    SerializationInfo,
    SerializerFunctionWrapHandler,
    field_serializer,
    model_serializer,
    model_validator,
)
from rapidkit_framework.i18n import is_i18n_key, t
from rapidkit_framework.status_codes import StatusCode
from sqlmodel import SQLModel as _SQLModel

from rapidkit_common.scope_runtime import apply_field_rules

from .base import BaseModel
from .types import LocalDatetime

T = TypeVar("T")


class BaseResponse(BaseModel):
    """
    基础响应模型。

    由受控模型的 ORM 对象构造（``from_attributes``）时记录来源模型，序列化时按当前请求的字段规则
    脱敏或移除字段；由 dict 构造的实例不处理（手工构造请使用 ``Scope.serialize``）。
    """

    model_config = ConfigDict(**(BaseModel.model_config or {}), from_attributes=True)

    _rapidkit_source: type | None = PrivateAttr(default=None)

    @model_validator(mode="wrap")
    @classmethod
    def _capture_source_model(cls, data: Any, handler: ModelWrapValidatorHandler[Self]) -> Self:
        instance = handler(data)
        if isinstance(data, _SQLModel) and getattr(type(data), "__table__", None) is not None:
            instance._rapidkit_source = type(data)
        return instance

    # 不标注返回类型，OpenAPI 仍按声明的字段生成
    @model_serializer(mode="wrap")
    def _apply_field_rules(self, handler: SerializerFunctionWrapHandler, info: SerializationInfo):
        data = handler(self)
        source = self._rapidkit_source
        if source is None or not isinstance(data, dict):
            return data
        aliases = {
            name: (field.serialization_alias or field.alias or name) if info.by_alias else name
            for name, field in type(self).model_fields.items()
        }
        return apply_field_rules(data, source, aliases=aliases)


class BaseSchema(BaseResponse):
    id: UUID

    create_time: LocalDatetime = Field(examples=["2024-07-31 16:07:34"])
    update_time: LocalDatetime = Field(examples=["2024-07-31 16:07:34"])


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

    code: int = Field(int(StatusCode.SUCCESS), description="状态码。")
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
        return t(value) if is_i18n_key(value) else value


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
                    "pageSize": 10,
                    "total": 100,
                    "records": []
                }
            }
    """

    page: int = Field(..., description="页码。")
    page_size: int = Field(..., description="每页条数。")
    total: int = Field(..., description="总条数。")
    records: list[T] = Field(..., description="记录列表。")


class CursorPaginatedResponse(BaseResponse, Generic[T]):
    """游标分页响应结构。"""

    items: list[T] = Field(..., description="记录列表。")
    next_cursor: UUID | None = Field(None, description="下一页游标，None 表示没有更多数据。")
    size: int = Field(..., description="每页条数。")
