"""
Author  : Coke
Date    : 2025-04-18
"""

from src.core.config import settings
from src.core.exceptions import AppException
from src.core.status_codes import StatusCode


def check_debug() -> None:
    """
    检查当前环境是否为调试模式。

    检查 ENVIRONMENT.is_debug 配置，若不是调试模式则抛出 NotFoundException。

    Raises:
        NotFoundException: 当前环境不是调试模式时抛出。
    """
    if not settings.ENVIRONMENT.is_debug:
        raise AppException(StatusCode.INVALID_OPERATION)
