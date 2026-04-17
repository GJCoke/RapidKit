"""
插件加载器 — 发现、排序、加载插件。

Author : Coke
Date   : 2026-04-14
"""

import importlib
import importlib.metadata
import time
from collections import deque
from pathlib import Path
from typing import TYPE_CHECKING, Callable, overload

if TYPE_CHECKING:
    from fastapi import FastAPI

from packaging.specifiers import SpecifierSet
from packaging.version import Version

from rapidkit_core.events import Event, event_bus
from rapidkit_core.log import logger
from rapidkit_core.plugin import (
    MiddlewareDef,
    PluginDependency,
    PluginError,
    PluginLoadResult,
    PluginManifest,
    PluginMeta,
)
from rapidkit_core.plugin_config import load_plugin_config


class PluginLoadError(Exception):
    """插件加载失败异常。"""


def _get_entry_points() -> list[importlib.metadata.EntryPoint]:
    """获取所有已注册的 rapidkit.plugins entry points。"""
    return list(importlib.metadata.entry_points(group="rapidkit.plugins"))


def _resolve_dependency_name(dep: str | PluginDependency) -> str:
    """从依赖声明中提取插件名称。"""

    if isinstance(dep, PluginDependency):
        return dep.name
    return dep


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
            dep_name = _resolve_dependency_name(dep)
            if dep_name not in name_map:
                raise PluginLoadError(f"Plugin '{m.name}' depends on '{dep_name}', but '{dep_name}' is not registered.")
            adjacency[dep_name].append(m.name)
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


def _check_version_constraints(
    manifests: list[PluginManifest],
) -> dict[str, PluginError]:
    """
    校验插件版本约束（PEP 440）。

    Returns:
        非 required 插件因版本不满足被跳过时的错误字典。

    Raises:
        PluginLoadError: required 插件版本约束不满足时抛出。
    """

    name_map = {m.name: m for m in manifests}
    errors: dict[str, PluginError] = {}

    for m in manifests:
        for dep in m.dependencies:
            if not isinstance(dep, PluginDependency) or dep.version is None:
                continue
            target = name_map.get(dep.name)
            if target is None:
                continue  # Missing dependency handled by topological_sort

            spec = SpecifierSet(dep.version)
            if Version(target.version) not in spec:
                msg = f"Plugin '{m.name}' requires '{dep.name}' version {dep.version}, but found v{target.version}."
                if m.required:
                    raise PluginLoadError(msg)
                errors[m.name] = PluginError(
                    plugin_name=m.name,
                    phase="version_check",
                    message=msg,
                )
                break

    return errors


def discover_and_load_plugins(
    config_path: Path | None = None,
    *,
    non_required_names: set[str] | None = None,
) -> PluginLoadResult:
    """
    通过 entry points 发现插件，结合配置过滤，然后加载并拓扑排序。

    Args:
        config_path: plugins.toml 配置文件路径，为 None 或不存在时全部启用。
        non_required_names: 加载失败时允许跳过的插件名集合。

    Returns:
        PluginLoadResult 包含成功加载的插件、禁用列表、错误信息和元数据。

    Raises:
        PluginLoadError: 必要插件加载失败时抛出。
    """

    non_required = non_required_names or set()
    config = load_plugin_config(config_path)
    entry_points = _get_entry_points()

    disabled: list[str] = []
    manifests: list[PluginManifest] = []
    errors: dict[str, PluginError] = {}
    meta: dict[str, PluginMeta] = {}

    for ep in entry_points:
        # 检查配置是否禁用
        if config.get(ep.name) is False:
            disabled.append(ep.name)
            logger.warning("Plugin '{}' is disabled by configuration.", ep.name)
            continue

        try:
            t0 = time.perf_counter()
            register_fn = ep.load()
            manifest = register_fn()
            register_ms = (time.perf_counter() - t0) * 1000

            if not isinstance(manifest, PluginManifest):
                raise PluginLoadError(
                    f"Plugin '{ep.name}' register() must return PluginManifest, got {type(manifest)}."
                )
            manifests.append(manifest)
            meta[manifest.name] = PluginMeta(register_ms=round(register_ms, 2))
            logger.info("Plugin '{}' v{} registered ({:.1f}ms).", manifest.name, manifest.version, register_ms)
        except PluginLoadError:
            raise
        except Exception as e:
            is_required = ep.name not in non_required
            if is_required:
                raise PluginLoadError(f"Failed to load required plugin '{ep.name}': {e}") from e
            logger.warning("Optional plugin '{}' failed to load: {}", ep.name, e)
            errors[ep.name] = PluginError(plugin_name=ep.name, phase="import", message=str(e))

    # 版本约束校验
    version_errors = _check_version_constraints(manifests)
    errors.update(version_errors)

    # 移除版本校验失败的插件
    failed_names = set(errors.keys())
    manifests = [m for m in manifests if m.name not in failed_names]

    # 级联失败：移除依赖了失败插件的非 required 插件
    changed = True
    while changed:
        changed = False
        still_valid: list[PluginManifest] = []
        for m in manifests:
            dep_names = {_resolve_dependency_name(d) for d in m.dependencies}
            missing = dep_names & failed_names
            if missing:
                root_cause = next(iter(missing))
                if m.required:
                    raise PluginLoadError(f"Required plugin '{m.name}' depends on failed plugin '{root_cause}'.")
                errors[m.name] = PluginError(
                    plugin_name=m.name,
                    phase="import",
                    message=f"Dependency '{root_cause}' failed to load.",
                    caused_by=root_cause,
                )
                failed_names.add(m.name)
                changed = True
                logger.warning("Plugin '{}' skipped due to failed dependency '{}'.", m.name, root_cause)
            else:
                still_valid.append(m)
        manifests = still_valid

    sorted_manifests = topological_sort(manifests)

    # 按拓扑顺序注册事件监听器
    for manifest in sorted_manifests:
        for entry in manifest.event_listeners:
            _register_event_listener(entry)

    return PluginLoadResult(plugins=sorted_manifests, disabled=disabled, errors=errors, meta=meta)


@overload
def _register_event_listener(entry: tuple[type[Event], Callable]) -> None: ...
@overload
def _register_event_listener(entry: tuple[type[Event], Callable, int]) -> None: ...
def _register_event_listener(entry: tuple[type[Event], Callable] | tuple[type[Event], Callable, int]) -> None:
    """注册单个事件监听器，支持 2-tuple 和 3-tuple 格式。"""
    event_type: type[Event] = entry[0]
    handler: Callable = entry[1]
    priority: int = entry[2] if len(entry) == 3 else 0  # ty: ignore[index-out-of-bounds]
    event_bus.on(event_type, handler, priority=priority)


def apply_dependency_overrides(app: FastAPI, plugins: list[PluginManifest]) -> None:
    """
    按拓扑序将插件声明的 dependency_overrides 应用到 FastAPI app。

    Args:
        app: FastAPI 应用实例。
        plugins: 已拓扑排序的插件列表。
    """
    for plugin in plugins:
        if plugin.dependency_overrides:
            app.dependency_overrides.update(plugin.dependency_overrides)
            logger.debug("Applied dependency_overrides from plugin '{}'.", plugin.name)


def mount_plugin_middlewares(app: FastAPI, plugins: list[PluginManifest]) -> None:
    """
    按 order 排序后挂载插件声明的中间件。

    Starlette 中间件栈是 LIFO — order 值小的后挂载，使其更靠近请求入口。
    同 order 的按插件拓扑序，同样后挂载的更靠外。

    Args:
        app: FastAPI 应用实例。
        plugins: 已拓扑排序的插件列表。
    """

    # 收集所有 (order, topo_index, MiddlewareDef)
    entries: list[tuple[int, int, MiddlewareDef]] = []
    for topo_idx, plugin in enumerate(plugins):
        for md in plugin.middlewares:
            entries.append((md.order, topo_idx, md))

    # 按 order 降序排列（大的先挂载），同 order 按 topo_index 降序（后面的先挂载）
    entries.sort(key=lambda e: (e[0], e[1]), reverse=True)

    for _, _, md in entries:
        app.add_middleware(md.cls, **md.kwargs)
