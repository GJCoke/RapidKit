"""
菜单残留接口判定（设计文档 7.4）：手工添加到菜单、未被菜单对应码覆盖的 Require 接口。

Author : Coke
Date   : 2026-10-17
"""

from collections.abc import Iterable, Mapping
from dataclasses import dataclass, field
from typing import Any, Literal

from plugin_permission.catalog.extensions import CatalogExtension
from plugin_permission.catalog.registry import PermissionCatalog

SkipReason = Literal["seed", "not_protected", "route_missing", "covered", "existing_extension", "unmapped_menu"]


@dataclass(frozen=True)
class SkippedInterface:
    route_name: str
    route_key: str
    reason: SkipReason


@dataclass
class ResidualReport:
    to_create: list[CatalogExtension] = field(default_factory=list)
    notes: dict[str, str] = field(default_factory=dict)
    skipped: list[SkippedInterface] = field(default_factory=list)


def plan_menu_residuals(
    *,
    menus: Iterable[Any],
    seed_interfaces: Mapping[str, set[str]],
    menu_codes: Mapping[str, str],
    catalog: PermissionCatalog,
    route_bindings: Mapping[str, str],
    all_route_keys: set[str],
    existing: list[CatalogExtension],
) -> ResidualReport:
    """
    规划需要转为 route_binding 扩展的菜单接口。

    Args:
        menus: 数据库菜单（需 route_name / interfaces / constant）。
        seed_interfaces: 种子菜单 route_name → 种子接口集合。
        menu_codes: 菜单 route_name → 权限码（C7）。
        catalog: 当前生效目录（含已有扩展）。
        route_bindings: Require 声明的 route_key → 声明码。
        all_route_keys: 应用全部 API 路由的 route_key。
        existing: 已有扩展。

    Returns:
        ResidualReport。
    """
    report = ResidualReport()
    planned = {(ext.code, ext.route_key) for ext in existing if ext.kind == "route_binding"}
    for menu in menus:
        if menu.constant or not menu.interfaces:
            continue
        code = menu_codes.get(menu.route_name)
        if code is None:
            report.skipped.append(SkippedInterface(menu.route_name, "*", "unmapped_menu"))
            continue
        seeds = seed_interfaces.get(menu.route_name, set())
        for route_key in menu.interfaces:
            reason: SkipReason | None = None
            if route_key in seeds:
                reason = "seed"
            elif route_key not in all_route_keys:
                reason = "route_missing"
            elif route_key not in route_bindings:
                reason = "not_protected"
            elif (code, route_key) in planned:
                reason = "existing_extension"
            elif route_bindings[route_key] in catalog.expand({code}) or code in catalog.codes_for_route(route_key):
                reason = "covered"
            if reason is not None:
                report.skipped.append(SkippedInterface(menu.route_name, route_key, reason))
                continue
            report.to_create.append(CatalogExtension(kind="route_binding", code=code, route_key=route_key))
            report.notes[route_key] = f"迁移自菜单 {menu.route_name}"
            planned.add((code, route_key))
    return report
