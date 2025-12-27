"""
HTTP Exceptions.

This file contains custom HTTP exceptions for the application.

Author : Coke
Date   : 2025-03-13
"""

from typing import Any

from fastapi import status
from fastapi.exceptions import HTTPException

from src.core.status_codes import StatusCode, get_status_code, get_status_description
from src.locales.i18n import t


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
        """
        初始化自定义 HTTP 异常。

        Args:
            status_code: HTTP 状态码（默认 500）。
            detail: 异常的详细信息（默认 "http server error."）。
            headers: 响应中包含的自定义头部（可选）。
        """
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
        """
        初始化应用异常。

        Args:
            code: 应用状态码（StatusCode 枚举或整数）
            message: 自定义错误消息，如果为 None 则使用状态码的默认描述
            data: 错误详情数据
            http_status_code: HTTP 状态码（默认 200）
            headers: 响应中包含的自定义头部

        Raises:
            ValueError: 如果 code 是无效的整数且不在 StatusCode 中
        """
        # 处理状态码
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

        # 设置错误消息
        self.message = message or t(description)  # type: ignore
        self.data = data

        # 调用父类初始化（不使用 detail，由异常处理器处理）
        super().__init__(
            status_code=http_status_code,
            detail=self.message,
            headers=headers,
        )

    def dump(self) -> dict[str, Any]:
        """
        将异常转换为字典格式。

        Returns:
            包含 code、message、data 的字典
        """
        return {
            "code": self.code,
            "message": self.message,
            "data": self.data,
        }
