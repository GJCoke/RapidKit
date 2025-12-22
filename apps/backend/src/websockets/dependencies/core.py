"""
Author  : Coke
Date    : 2025-05-20
"""

import inspect
from typing import Any, Awaitable, Callable, Dict

from pydantic._internal._model_construction import ModelMetaclass

from src.websockets.params import SID, Environ

from .utils import get_param_depend


class LifespanContext:
    """
    管理异步/生成器依赖的清理函数。
    """

    def __init__(self) -> None:
        self.teardowns: list[Callable[[], Awaitable[None]]] = []

    async def run_teardowns(self) -> None:
        """
        逆序执行所有已注册的清理回调。
        """
        for cleanup in reversed(self.teardowns):
            await cleanup()


async def extract_kwargs_from_signature(
    func: Callable,
    context: LifespanContext,
    cache: Dict[Any, Any],
) -> dict[str, Any]:
    """
    提取调用函数所需的关键字参数，并解析依赖。

    Args:
        func: 需要解析参数的函数。
        context: 用于注册清理任务的生命周期上下文。
        cache: 用于缓存依赖结果的字典。

    Returns:
        已解析依赖和注入值的关键字参数字典。
    """
    sig = inspect.signature(func)
    kwargs: dict[str, Any] = {}
    unknown_params: list[tuple[str, inspect.Parameter]] = []

    for name, param in sig.parameters.items():
        if dep := get_param_depend(param):
            result = await solve_dependency(dep.dependency, context, cache, dep.use_cache)
            kwargs[name] = result

        elif param.annotation in (SID, Environ):
            kwargs[name] = resolve_special_param(param, cache)

        elif param.default != inspect.Parameter.empty:
            kwargs[name] = param.default

        else:
            unknown_params.append((name, param))

    # Automatically infer data argument if unknown parameters exist.
    if unknown_params:
        param_name, param = unknown_params[0]
        kwargs[param_name] = resolve_unknown_param(param, cache)

    return kwargs


def resolve_special_param(param: inspect.Parameter, cache: dict[str, Any]) -> Any:
    """
    解析如 SID 或 Environ 等特殊注解参数。

    Args:
        param: 当前处理的函数参数。
        cache: 依赖缓存。

    Returns:
        从缓存中解析得到的值。
    """
    key = f"__{param.annotation.__name__.lower()}__"
    return cache.get(key)


def resolve_unknown_param(param: inspect.Parameter, cache: dict[str, Any]) -> Any:
    """
    使用类型注解和缓存数据解析未知参数。

    Args:
        param: 当前处理的函数参数。
        cache: 包含输入数据的依赖缓存。

    Returns:
        解析得到的参数值，可能是从数据反序列化而来。
    """
    annotation = param.annotation
    if annotation and inspect.isclass(annotation) and isinstance(annotation, ModelMetaclass):
        return annotation(**cache["__data__"])
    return cache["__data__"]


async def run_with_lifespan_handling(
    func: Callable,
    kwargs: dict[str, Any],
    context: LifespanContext,
) -> Any:
    """
    执行函数并在返回生成器时注册清理回调。

    支持：
    - 异步生成器（带 yield）
    - 同步生成器（带 yield）
    - 协程（异步函数）
    - 普通返回值

    Args:
        func: 要调用的函数。
        kwargs: 传递给函数的关键字参数。
        context: 用于注册清理回调的生命周期上下文。

    Returns:
        生成器的首次产出值、协程的 await 结果或直接返回值。
    """
    result = func(**kwargs)

    if inspect.isasyncgen(result):
        value = await result.__anext__()

        async def cleanup() -> None:
            try:
                await result.__anext__()
            except StopAsyncIteration:
                pass

        context.teardowns.append(cleanup)
        return value

    elif inspect.isgenerator(result):
        value = next(result)

        async def cleanup() -> None:
            try:
                next(result)
            except StopIteration:
                pass

        context.teardowns.append(cleanup)
        return value

    elif inspect.iscoroutine(result):
        return await result

    return result


async def solve_dependency(
    func: Callable,
    context: LifespanContext,
    cache: Dict[Any, Any],
    use_cache: bool = True,
) -> Any:
    """
    递归调用依赖自身的依赖以解析依赖。

    处理缓存和生命周期清理注册。

    Args:
        func: 要解析的依赖函数。
        context: 用于管理清理的生命周期上下文。
        cache: 用于存储已解析值的缓存。
        use_cache: 是否为该依赖使用缓存。

    Returns:
        该依赖的解析值。
    """
    if use_cache and func in cache:
        return cache[func]

    kwargs = await extract_kwargs_from_signature(func, context, cache)

    result = await run_with_lifespan_handling(func, kwargs, context)

    if use_cache:
        cache[func] = result

    return result
