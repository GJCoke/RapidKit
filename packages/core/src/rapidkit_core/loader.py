"""
插件加载器 — 发现、排序、加载插件。

Author : Coke
Date   : 2026-04-14
"""

import importlib
from collections import deque

from rapidkit_core.events import event_bus
from rapidkit_core.log import logger
from rapidkit_core.plugin import PluginManifest


class PluginLoadError(Exception):
    """插件加载失败异常。"""


def topological_sort(manifests: list[PluginManifest]) -> list[PluginManifest]:
    """
    对插件列表按依赖关系进行拓扑排序（Kahn 算法）。

    Args:
        manifests: 插件清单列表。

    Returns:
        按依赖顺序排列的插件清单列表。

    Raises:
        PluginLoadError: 存在循环依赖或缺失依赖时抛出。
    """
    name_map: dict[str, PluginManifest] = {}
    for m in manifests:
        if m.name in name_map:
            raise PluginLoadError(f"Duplicate plugin name: {m.name}")
        name_map[m.name] = m

    # 构建邻接表和入度表
    in_degree: dict[str, int] = {m.name: 0 for m in manifests}
    adjacency: dict[str, list[str]] = {m.name: [] for m in manifests}

    for m in manifests:
        for dep in m.dependencies:
            if dep not in name_map:
                raise PluginLoadError(f"Plugin '{m.name}' depends on '{dep}', but '{dep}' is not registered.")
            adjacency[dep].append(m.name)
            in_degree[m.name] += 1

    # Kahn 算法
    queue: deque[str] = deque()
    for name, degree in in_degree.items():
        if degree == 0:
            queue.append(name)

    result: list[PluginManifest] = []
    while queue:
        current = queue.popleft()
        result.append(name_map[current])
        for neighbor in adjacency[current]:
            in_degree[neighbor] -= 1
            if in_degree[neighbor] == 0:
                queue.append(neighbor)

    if len(result) != len(manifests):
        sorted_names = {m.name for m in result}
        unsorted = [m.name for m in manifests if m.name not in sorted_names]
        raise PluginLoadError(f"Circular dependency detected among plugins: {unsorted}")

    return result


def discover_and_load_plugins(module_names: list[str]) -> list[PluginManifest]:
    """
    导入插件模块并调用 register() 收集清单，然后拓扑排序。

    每个模块必须暴露 ``register() -> PluginManifest`` 函数。

    Args:
        module_names: Python 模块路径列表，如 ["plugin_script", "plugin_auth"]。

    Returns:
        按依赖排序的 PluginManifest 列表。

    Raises:
        PluginLoadError: 必要插件加载失败时抛出。
    """
    manifests: list[PluginManifest] = []

    for module_name in module_names:
        try:
            mod = importlib.import_module(module_name)
            register_fn = getattr(mod, "register", None)
            if register_fn is None:
                raise PluginLoadError(f"Plugin module '{module_name}' has no register() function.")
            manifest = register_fn()
            if not isinstance(manifest, PluginManifest):
                raise PluginLoadError(
                    f"Plugin '{module_name}' register() must return PluginManifest, got {type(manifest)}."
                )
            manifests.append(manifest)
            logger.info(f"Plugin '{manifest.name}' v{manifest.version} registered.")
        except Exception as e:
            logger.error("Failed to load plugin '{module_name}': {error}", module_name=module_name, error=e)
            # 判断是否能跳过：如果插件已经在 manifests 中且 required=False 可跳过
            # 但这里还没拿到 manifest，所以默认当作必要插件处理
            raise PluginLoadError(f"Failed to load plugin '{module_name}': {e}") from e

    sorted_manifests = topological_sort(manifests)

    # 按拓扑顺序注册事件监听器
    for manifest in sorted_manifests:
        for event_name, handler in manifest.event_listeners:
            event_bus.on(event_name, handler)

    return sorted_manifests
