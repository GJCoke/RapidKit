"""
HTTP Exceptions.

This file contains custom HTTP exceptions for the application.

Author : Coke
Date   : 2025-03-13
"""

from fastapi import status
from fastapi.exceptions import HTTPException


class BaseHTTPException(HTTPException):
    """通用错误的基础 HTTP 异常类。"""

    status_code = status.HTTP_500_INTERNAL_SERVER_ERROR

    def __init__(
        self,
        *,
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail="common.response.internalServer",
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


class BadRequestException(BaseHTTPException):
    """请求参数错误（400 错误）异常。"""

    def __init__(
        self,
        *,
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="common.response.badRequest",
    ):
        """
        初始化 BadRequestException。

        Args:
            status_code: 错误请求的 HTTP 状态码（默认 400）。
            detail: 错误信息（默认 "bad request."）。
        """
        super().__init__(status_code=status_code, detail=detail)


class UnauthorizedException(BaseHTTPException):
    """未授权（401 错误）异常。"""

    def __init__(
        self,
        *,
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="common.response.unauthorized",
    ):
        """
        初始化 UnauthorizedException。

        Args:
            status_code: 未授权的 HTTP 状态码（默认 401）。
            detail: 错误信息（默认 "unauthorized."）。
        """
        super().__init__(status_code=status_code, detail=detail)


class PermissionDeniedException(BaseHTTPException):
    """权限拒绝（403 错误）异常。"""

    def __init__(
        self,
        *,
        status_code=status.HTTP_403_FORBIDDEN,
        detail="common.response.permissionDenied",
    ):
        """
        初始化 PermissionDeniedException。

        Args:
            status_code: 权限拒绝的 HTTP 状态码（默认 403）。
            detail: 错误信息（默认 "permission denied."）。
        """
        super().__init__(status_code=status_code, detail=detail)


class NotFoundException(BaseHTTPException):
    """资源未找到（404 错误）异常。"""

    def __init__(
        self,
        *,
        status_code=status.HTTP_404_NOT_FOUND,
        detail="common.response.notFound",
    ):
        """
        初始化 NotFoundException。

        Args:
            status_code: 未找到错误的 HTTP 状态码（默认 404）。
            detail: 错误信息（默认 "not found."）。
        """
        super().__init__(status_code=status_code, detail=detail)


class ExistsException(BaseHTTPException):
    """资源已存在（409 错误）异常。"""

    def __init__(
        self,
        *,
        status_code=status.HTTP_409_CONFLICT,
        detail="common.response.resourceAlreadyExists",
    ):
        """
        初始化 ExistsException。

        Args:
            status_code: 资源已存在错误的 HTTP 状态码（默认 409）。
            detail: 错误信息（默认 "resource already exists."）。
        """
        super().__init__(status_code=status_code, detail=detail)


class InvalidParameterError(Exception):
    """参数无效异常。"""

    def __init__(self, message="Invalid parameter.", param=""):
        """
        初始化 InvalidParameterError。

        Args:
            message: 错误信息（默认 "Invalid parameter."）。
            param: 参数名（可选）。
        """
        if param:
            message = f"Parameter '{param}' is required and cannot be empty."
        super().__init__(message)
