# apps/backend/src/_permission_migration.py
"""
角色权限迁移规划：旧 router / button / interface 三列 → 直接授予的权限码。

只做计算与报告，不读写数据库。

Author : Coke
Date   : 2026-10-17
"""

from dataclasses import dataclass, field

from plugin_permission.catalog.registry import PermissionCatalog

from src._permission_code_mapping import LEGACY_BUTTON_CODES, LEGACY_MENU_CODES


@dataclass(frozen=True)
class LegacyRole:
    """迁移输入：角色旧三列。"""

    code: str
    router_permissions: list[str]
    button_permissions: list[str]
    interface_permissions: list[str]


@dataclass
class RoleMigrationPlan:
    """单个角色的迁移结果。"""

    role_code: str
    codes: list[str] = field(default_factory=list)
    narrowed: list[str] = field(default_factory=list)
    widened: list[str] = field(default_factory=list)
    unmapped_routes: list[str] = field(default_factory=list)


@dataclass(frozen=True)
class ResidualInterface:
    """菜单中手工添加、代码中无声明的接口（P5 转为扩展）。"""

    menu: str
    route_key: str


def plan_role(
    role: LegacyRole,
    *,
    bindings: dict[str, str],
    exempt: set[str],
    catalog: PermissionCatalog,
    directory_routes: set[str],
) -> RoleMigrationPlan:
    """
    推导角色应直接授予的码。

    Args:
        role: 旧三列。
        bindings: route_key -> 声明码。
        exempt: 仅 ``Authenticated`` / ``Public`` 的接口，旧授权直接忽略。
        catalog: 当前目录。
        directory_routes: 目录与常量菜单的 route_name，不参与映射。

    Returns:
        迁移结果；``codes`` 未展开 depends，``widened`` 按展开后计算。
    """
    plan = RoleMigrationPlan(role_code=role.code)
    codes: set[str] = set()

    def grant(code: str, origin: str) -> None:
        if code in catalog.codes:
            codes.add(code)
        else:
            plan.narrowed.append(f"{origin} -> {code} (undeclared)")

    for button in role.button_permissions:
        if button in exempt:
            continue
        code = LEGACY_BUTTON_CODES.get(button) or bindings.get(button)
        if code is None:
            plan.narrowed.append(f"button {button}")
        else:
            grant(code, f"button {button}")

    for route_key in role.interface_permissions:
        if route_key in exempt:
            continue
        code = bindings.get(route_key)
        if code is None:
            plan.narrowed.append(f"interface {route_key}")
        else:
            grant(code, f"interface {route_key}")

    for route in role.router_permissions:
        if route in directory_routes:
            continue
        code = LEGACY_MENU_CODES.get(route)
        if code is None:
            plan.unmapped_routes.append(route)
        else:
            grant(code, f"menu {route}")

    legacy = set(role.interface_permissions)
    expanded = catalog.expand(codes)
    plan.codes = sorted(codes)
    plan.widened = sorted(
        route_key for route_key, code in bindings.items() if code in expanded and route_key not in legacy
    )
    return plan


def find_residual_interfaces(
    menus: list[tuple[str, list[str]]],
    *,
    bindings: dict[str, str],
    exempt: set[str],
) -> list[ResidualInterface]:
    """
    找出菜单 ``interfaces`` 中既没有声明码、也不是免检接口的条目。

    Args:
        menus: (route_name, interfaces) 列表。
        bindings: route_key -> 声明码。
        exempt: 免检接口。

    Returns:
        按菜单、接口排序的残留列表。
    """
    residuals = {
        ResidualInterface(menu=menu, route_key=route_key)
        for menu, interfaces in menus
        for route_key in interfaces
        if route_key not in bindings and route_key not in exempt
    }
    return sorted(residuals, key=lambda item: (item.menu, item.route_key))


def format_report(plans: list[RoleMigrationPlan], residuals: list[ResidualInterface]) -> str:
    """生成供人工审阅的迁移报告。"""
    lines: list[str] = []
    for plan in plans:
        lines.append(f"== 角色 {plan.role_code}")
        lines.append(f"  授予码（{len(plan.codes)}）: {', '.join(plan.codes) or '-'}")
        sections = (
            ("收窄（旧授权无法映射，默认不授予，需人工决定授予码或创建扩展）", plan.narrowed),
            ("扩大（新码带来、旧授权中没有的接口）", plan.widened),
            ("沿用旧路由权限（不在 C7 菜单表中的菜单，P3 前保持）", plan.unmapped_routes),
        )
        for title, items in sections:
            lines.append(f"  {title}: {len(items)}")
            lines.extend(f"    - {item}" for item in items)
    lines.append(f"== 残留接口（菜单中手工添加、代码无声明，P5 转为扩展）: {len(residuals)}")
    lines.extend(f"    - {item.menu}  {item.route_key}" for item in residuals)
    return "\n".join(lines)
