"""
权限扩展层的纯数据与判定逻辑。

扩展只能追加：接口绑定、追加依赖、自定义码。判定结果为 active / cleanable / invalid，
只有 active 会被合并进生效目录；判定从不抛异常，保证启动不因扩展失效而中断。

Author : Coke
Date   : 2026-10-17
"""

import re
from collections.abc import Iterable, Mapping
from dataclasses import dataclass, field
from typing import Any, Literal, Protocol
from uuid import UUID

ExtensionKind = Literal["route_binding", "depends", "custom_code"]
ExtensionStatus = Literal["active", "cleanable", "invalid"]
ExtensionReason = Literal[
    "covered_by_baseline",
    "redundant",
    "invalid_format",
    "unknown_resource",
    "resource_mismatch",
    "invalid_action",
    "unknown_code",
    "unknown_route",
    "cycle",
]

CODE_PATTERN = re.compile(r"^[a-z][a-z0-9-]*:[a-z][a-z0-9-]*$")


@dataclass(frozen=True)
class CatalogExtension:
    """扩展记录的纯数据形式（索引 C6），由 build_catalog 消费。"""

    kind: ExtensionKind
    code: str
    id: UUID | None = None
    route_key: str | None = None
    depends_on: str | None = None
    resource: str | None = None
    label: str | None = None
    abac_action: str | None = None


@dataclass(frozen=True)
class ExtensionState:
    """单条扩展的判定结果。"""

    extension: CatalogExtension
    status: ExtensionStatus
    reason: ExtensionReason | None = None


@dataclass(frozen=True)
class ExtensionPlan:
    """可合并进目录的扩展结果。"""

    custom_codes: tuple[CatalogExtension, ...] = ()
    depends: dict[str, tuple[str, ...]] = field(default_factory=dict)
    route_codes: dict[str, frozenset[str]] = field(default_factory=dict)
    states: tuple[ExtensionState, ...] = ()


class BaselineCatalog(Protocol):
    """plan_extensions 需要的基线目录最小接口。"""

    resources: Mapping[str, Any]
    codes: Mapping[str, Any]

    def expand(self, codes: Iterable[str]) -> set[str]: ...

    def codes_for_route(self, route_key: str) -> set[str]: ...


def _reachable(graph: Mapping[str, Iterable[str]], start: str, target: str) -> bool:
    """在依赖图中判断 start 是否可达 target（不含 start 自身）。"""
    seen: set[str] = set()
    stack = list(graph.get(start, ()))
    while stack:
        code = stack.pop()
        if code == target:
            return True
        if code in seen:
            continue
        seen.add(code)
        stack.extend(graph.get(code, ()))
    return False


def _closure(graph: Mapping[str, Iterable[str]], start: str) -> set[str]:
    """返回 start 及其传递依赖。"""
    result: set[str] = set()
    stack = [start]
    while stack:
        code = stack.pop()
        if code in result:
            continue
        result.add(code)
        stack.extend(graph.get(code, ()))
    return result


def _check_custom_code(
    ext: CatalogExtension, baseline: BaselineCatalog, accepted: set[str]
) -> tuple[ExtensionStatus, ExtensionReason | None]:
    if ext.code in baseline.codes:
        return "cleanable", "covered_by_baseline"
    if not CODE_PATTERN.match(ext.code):
        return "invalid", "invalid_format"
    if ext.resource not in baseline.resources:
        return "invalid", "unknown_resource"
    if ext.code.split(":", 1)[0] != ext.resource:
        return "invalid", "resource_mismatch"
    if ext.abac_action not in ("read", "write"):
        return "invalid", "invalid_action"
    if ext.code in accepted:
        return "cleanable", "redundant"
    return "active", None


def plan_extensions(
    baseline: BaselineCatalog,
    route_bindings: Mapping[str, str],
    extensions: Iterable[CatalogExtension],
) -> ExtensionPlan:
    """
    按"自定义码 → 追加依赖 → 接口绑定"三轮判定扩展，输入顺序即优先顺序。

    Args:
        baseline: 不含任何扩展的基线目录。
        route_bindings: Require 声明的接口 route_key → 声明码。
        extensions: 待判定的扩展，通常按创建时间升序。

    Returns:
        ExtensionPlan，``states`` 与输入顺序一致。
    """
    items = list(extensions)
    results: dict[int, ExtensionState] = {}

    # 第 1 轮：自定义码
    accepted_custom: dict[str, CatalogExtension] = {}
    for index, ext in enumerate(items):
        if ext.kind != "custom_code":
            continue
        status, reason = _check_custom_code(ext, baseline, set(accepted_custom))
        if status == "active":
            accepted_custom[ext.code] = ext
        results[index] = ExtensionState(ext, status, reason)

    known = set(baseline.codes) | set(accepted_custom)
    baseline_graph: dict[str, tuple[str, ...]] = {code: tuple(item.depends) for code, item in baseline.codes.items()}
    graph: dict[str, list[str]] = {code: list(deps) for code, deps in baseline_graph.items()}
    for code in accepted_custom:
        graph.setdefault(code, [])

    # 第 2 轮：追加依赖
    extra_depends: dict[str, list[str]] = {}
    for index, ext in enumerate(items):
        if ext.kind != "depends":
            continue
        target = ext.depends_on or ""
        if ext.code not in known or target not in known:
            results[index] = ExtensionState(ext, "invalid", "unknown_code")
        elif ext.code == target:
            results[index] = ExtensionState(ext, "invalid", "cycle")
        elif _reachable(graph, ext.code, target):
            reason: ExtensionReason = (
                "covered_by_baseline" if _reachable(baseline_graph, ext.code, target) else "redundant"
            )
            results[index] = ExtensionState(ext, "cleanable", reason)
        elif _reachable(graph, target, ext.code):
            results[index] = ExtensionState(ext, "invalid", "cycle")
        else:
            graph[ext.code].append(target)
            extra_depends.setdefault(ext.code, []).append(target)
            results[index] = ExtensionState(ext, "active")

    # 第 3 轮：接口绑定
    route_codes: dict[str, set[str]] = {}
    for index, ext in enumerate(items):
        if ext.kind != "route_binding":
            continue
        route_key = ext.route_key or ""
        declared = route_bindings.get(route_key)
        if declared is None:
            results[index] = ExtensionState(ext, "invalid", "unknown_route")
        elif ext.code not in known:
            results[index] = ExtensionState(ext, "invalid", "unknown_code")
        elif declared in _closure(graph, ext.code) or ext.code in route_codes.get(route_key, set()):
            covered = ext.code in baseline.codes and (
                declared in baseline.expand({ext.code}) or ext.code in baseline.codes_for_route(route_key)
            )
            results[index] = ExtensionState(ext, "cleanable", "covered_by_baseline" if covered else "redundant")
        else:
            route_codes.setdefault(route_key, set()).add(ext.code)
            results[index] = ExtensionState(ext, "active")

    return ExtensionPlan(
        custom_codes=tuple(accepted_custom.values()),
        depends={code: tuple(deps) for code, deps in extra_depends.items()},
        route_codes={key: frozenset(codes) for key, codes in route_codes.items()},
        states=tuple(results[index] for index in range(len(items))),
    )
