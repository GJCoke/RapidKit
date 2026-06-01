"""
ServiceRegistry — 插件间服务发现，替代直接 import。

Author : Coke
Date   : 2026-05-11
"""

from typing import TypeVar, cast

T = TypeVar("T")


class ServiceRegistry:
    """运行时服务注册表，通过 Protocol 类型做 key 查找实现。"""

    def __init__(self) -> None:
        self._services: dict[type, object] = {}

    def register(self, protocol: type[T], impl: T) -> None:
        """注册一个 Protocol 的实现。后注册覆盖先注册。"""
        self._services[protocol] = impl

    def get(self, protocol: type[T]) -> T:
        """获取服务实现，未注册则抛 RuntimeError。"""
        if protocol not in self._services:
            raise RuntimeError(
                f"Service {protocol.__name__} not registered. "
                f"Ensure the providing plugin is loaded and lists this protocol in 'provides'."
            )
        return cast(T, self._services[protocol])

    def get_optional(self, protocol: type[T]) -> T | None:
        """获取服务实现，未注册返回 None。"""
        return cast(T | None, self._services.get(protocol))

    def clear(self) -> None:
        """清空所有注册（测试用）。"""
        self._services.clear()

    def registered_protocols(self) -> list[type]:
        """返回所有已注册的 Protocol 类型列表。"""
        return list(self._services.keys())


# Module-level singleton
service_registry = ServiceRegistry()


def get_service(protocol: type[T]) -> T:
    """模块级快捷方式 — 从全局 registry 获取服务。"""
    return service_registry.get(protocol)


def get_service_optional(protocol: type[T]) -> T | None:
    """模块级快捷方式 — 从全局 registry 获取服务，未注册返回 None。"""
    return service_registry.get_optional(protocol)
