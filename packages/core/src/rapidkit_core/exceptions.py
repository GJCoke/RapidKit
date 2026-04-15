"""
HTTP Exceptions.

Author : Coke
Date   : 2025-03-13
"""

from typing import Any

from fastapi import status
from fastapi.exceptions import HTTPException

from rapidkit_core.i18n import t
from rapidkit_core.status_codes import StatusCode, get_status_code, get_status_description


class BaseHTTPException(HTTPException):
    """通用错误的基础 HTTP 异常类。"""

    status_code = status.HTTP_500_INTERNAL_SERVER_ERROR

    def __init__(
        self,
        *,
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail="common.response.internalServerError",
        headers=None,
    ):
        super().__init__(status_code, detail, headers)


class AppException(BaseHTTPException):
    """基于应用状态码的通用异常类。"""

    def __init__(
        self,
        code: StatusCode | int,
        *,
        message: str | None = None,
        data: Any = None,
        http_status_code: int = status.HTTP_200_OK,
        headers: dict[str, str] | None = None,
    ):
        if isinstance(code, StatusCode):
            self.code = code.code
            self.status_code_enum = code
            description = code.description
        elif isinstance(code, int):
            status_code_enum = get_status_code(code)
            if status_code_enum is None:
                raise ValueError(f"Invalid status code: {code}")
            self.code = code
            self.status_code_enum = status_code_enum
            description = get_status_description(code)
        else:
            raise TypeError(f"The status code must be a StatusCode enum or integer; it cannot be: {type(code)}")

        self.message = message or t(description)  # type: ignore
        self.data = data

        super().__init__(
            status_code=http_status_code,
            detail=self.message,
            headers=headers,
        )

    def dump(self) -> dict[str, Any]:
        return {
            "code": self.code,
            "message": self.message,
            "data": self.data,
        }
