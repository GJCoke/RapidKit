"""
本模块提供用于解析和转换函数参数依赖注入信息的工具，支持自定义 `Depends` 和 FastAPI 风格的 `Depends`，
兼容 `Annotated` 类型注解。

Author  : Coke
Date    : 2025-05-20
"""

import inspect
from typing import Annotated, Any, get_args, get_origin

from src.websockets.params import Depends

FastAPIDepends: Any
try:
    from fastapi.params import Depends as FastAPIDepends
except ImportError:
    FastAPIDepends = None  # type: ignore


def convert_to_depends(obj: Any) -> Depends | None:
    """
    将对象转换为 `Depends` 实例。

    此函数支持自定义 `Depends` 和 FastAPI 的 Depends 对象。

    Args:
        obj: 要转换的对象，可能为 `Depends` 或 FastAPI Depends。

    Returns:
        如果可转换则返回 `Depends` 实例，否则返回 None。
    """
    if isinstance(obj, Depends):
        return obj
    if FastAPIDepends and isinstance(obj, FastAPIDepends):
        return Depends(obj.dependency, use_cache=obj.use_cache)
    return None


def extract_annotated_dependency(annotation: Any) -> Depends | None:
    """
    从 Annotated 类型注解中提取依赖。

    遍历 `Annotated` 类型中的元数据，返回第一个可转换的 `Depends` 实例。

    Args:
        annotation: 类型注解，可能为 `Annotated`。

    Returns:
        如果找到则返回 `Depends` 实例，否则返回 None。
    """
    if get_origin(annotation) is not Annotated:
        return None

    for metadata in get_args(annotation)[1:]:
        if depend := convert_to_depends(metadata):
            return depend
    return None


def extract_default_dependency(default: Any) -> Depends | None:
    """
    从参数的默认值中提取依赖。

    Args:
        default: 参数的默认值。

    Returns:
        如果找到则返回 `Depends` 实例，否则返回 None。
    """
    return convert_to_depends(default)


def get_param_depend(param: inspect.Parameter) -> Depends | None:
    """
    从函数参数中提取依赖信息。

    同时检查 Annotated 元数据和默认值以解析已定义的依赖。

    Args:
        param: 要检查的函数参数。

    Returns:
        如果声明了依赖则返回 `Depends` 实例，否则返回 None。
    """
    if depend := extract_annotated_dependency(param.annotation):
        return depend

    return extract_default_dependency(param.default)
