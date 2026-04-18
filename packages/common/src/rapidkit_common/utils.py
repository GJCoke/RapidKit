"""
Author  : Coke
Date    : 2025-05-19
"""

from fastapi.exceptions import ValidationException
from pydantic import ValidationError


def format_validation_errors(e: ValidationError | ValidationException) -> str:
    """
    将 Pydantic 或 FastAPI 校验错误格式化为可读字符串。

    Args:
        e: 包含校验错误的异常实例。

    Returns:
        以分号分隔的错误描述字符串，每条包含错误位置和信息。
    """
    errors = []
    for item in e.errors():
        loc = item.get("loc", ["unknown"])
        loc_str = ".".join(str(part) for part in loc)
        msg = str(item.get("msg", "error."))
        errors.append(f"{loc_str} {msg}")
    return "; ".join(errors)
