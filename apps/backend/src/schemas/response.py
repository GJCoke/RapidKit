"""
Response model schemas.

Author : Coke
Date   : 2025-03-12
"""

from datetime import datetime
from typing import Any, Generic, TypeVar
from uuid import UUID

from fastapi import status
from pydantic import ConfigDict, Field, field_serializer

from src.locales.i18n import t
from src.schemas import BaseModel
from src.utils.date import convert_datetime_to_gmt

T = TypeVar("T")


class BaseResponse(BaseModel):
    """Base response model."""

    model_config = ConfigDict(**(BaseModel.model_config or {}), from_attributes=True)


class BaseSchema(BaseResponse):
    id: UUID

    create_time: datetime = Field(examples=["2024-07-31 16:07:34"])
    update_time: datetime = Field(examples=["2024-07-31 16:07:34"])

    @field_serializer("create_time", "update_time")
    def serialize_datetime(self, value: datetime) -> str:
        """
        Pydantic serializer for datetime fields.

        Converts datetime fields to GMT string format when serializing to JSON.

        Args:
            value: datetime value to serialize

        Returns:
            String representation of datetime in GMT
        """
        return convert_datetime_to_gmt(value)


class ResponseSchema(BaseSchema):
    """Response schema."""

    id: UUID


class Response(BaseResponse, Generic[T]):
    """
    Unified response.

    Examples:
        @router.get("/user")
        def user() -> Response[UserInfo]:
            pass
    """

    code: int = Field(status.HTTP_200_OK, description=t("common.response.statusCode"))
    message: str = Field(t("common.response.success"))
    data: T | None = Field(None, description=t("common.response.data"))

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


class PaginatedResponse(BaseResponse, Generic[T]):
    """
    Unified paginated response.

    Examples:
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

    page: int = Field(..., description=t("common.response.pageNumber"))
    page_size: int = Field(..., description=t("common.response.pageSize"))
    total: int = Field(..., description=t("common.response.total"))
    records: list[T] = Field(..., description=t("common.response.records"))


class BadRequestResponse(Response):
    """Unified Bad request response."""

    code: int = status.HTTP_400_BAD_REQUEST
    message: str = t("common.error.badRequest")
    data: None = None


class AuthenticationError(Response):
    """Authentication error response."""

    code: int = status.HTTP_401_UNAUTHORIZED
    message: str = t("common.error.unauthorized")
    data: None = None


class PermissionResponse(Response):
    """Unified permission response."""

    code: int = status.HTTP_403_FORBIDDEN
    message: str = t("common.error.permissionDenied")
    data: None = None


class NotFoundResponse(Response):
    """Unified not found response."""

    code: int = status.HTTP_404_NOT_FOUND
    message: str = t("common.error.notFound")
    data: None = None


class ValidationErrorResponse(Response):
    """Unified unprocessable entity response."""

    code: int = status.HTTP_422_UNPROCESSABLE_ENTITY
    message: str = t("common.error.invalidParameter")
    data: str = t("common.error.invalidParameterDetails")


class ServerErrorResponse(Response):
    """Unified server error response."""

    code: int = status.HTTP_500_INTERNAL_SERVER_ERROR
    message: str = t("common.error.internalServer")
    data: str = t("common.error.internalServerDetails")


class SocketErrorResponse(Response):
    """Unified websocket server error response."""

    code: int = status.WS_1011_INTERNAL_ERROR
    message: str = t("common.error.internalServer")
    event: str
    data: str = t("common.error.internalServerDetails")


RESPONSES = {
    400: {"description": t("common.error.badRequest"), "model": BadRequestResponse},
    401: {"description": t("common.error.unauthorized"), "model": AuthenticationError},
    403: {"description": t("common.error.permissionDenied"), "model": PermissionResponse},
    404: {"description": t("common.error.notFound"), "model": NotFoundResponse},
    422: {"description": t("common.error.invalidParameter"), "model": ValidationErrorResponse},
    500: {"description": t("common.error.internalServer"), "model": ServerErrorResponse},
}
