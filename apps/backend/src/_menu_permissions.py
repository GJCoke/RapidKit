"""Seed menu synchronization and seed-derived demo role permissions."""

from plugin_menu.models import Menu
from rapidkit_common.enums import MenuType

from src._menu_seeds import build_menus


def seed_menu_permission_codes(route_names: list[str]) -> list[str]:
    """Collect the page permission codes of the selected seed menus (used by demo roles)."""
    return sorted({menu.permission for menu in build_menus() if menu.route_name in route_names and menu.permission})


def plan_menu_sync(existing: list[Menu]) -> tuple[list[Menu], list[tuple[Menu, str]]]:
    """Validate the entire plan before changing stored objects; fill only missing page permissions."""
    by_name = {menu.route_name: menu for menu in existing}
    by_path = {menu.route_path: menu.route_name for menu in existing}
    seeds = build_menus()
    resolved_ids = {seed.id: by_name.get(seed.route_name, seed).id for seed in seeds}
    missing: list[Menu] = []
    updates: list[tuple[Menu, str]] = []
    for seed in seeds:
        current = by_name.get(seed.route_name)
        if current is None:
            if seed.route_path in by_path:
                raise ValueError(f"Menu path already belongs to another route: {seed.route_path}")
            if seed.parent_id is not None:
                seed.parent_id = resolved_ids[seed.parent_id]
            if seed.active_menu_id is not None:
                seed.active_menu_id = resolved_ids[seed.active_menu_id]
            missing.append(seed)
            continue
        # Keep customized permissions; only fill page menus that have none yet.
        if (
            current.permission is None
            and seed.permission is not None
            and current.menu_type == MenuType.MENU
            and not current.constant
        ):
            updates.append((current, seed.permission))
    return missing, updates
