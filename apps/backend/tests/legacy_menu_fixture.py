"""Frozen menu data for regression tests of the pre-P3 migration."""

import json
from pathlib import Path
from types import SimpleNamespace


def legacy_menus():
    rows = json.loads((Path(__file__).parent / "fixtures/legacy_menu_permissions.json").read_text())
    return [SimpleNamespace(**row) for row in rows]


def collect_seed_permissions(route_names=None):
    menus = [
        menu for menu in legacy_menus() if not menu.constant and (route_names is None or menu.route_name in route_names)
    ]
    return {
        "router_permissions": sorted({menu.route_name for menu in menus}),
        "button_permissions": sorted({button["code"] for menu in menus for button in menu.buttons}),
        "interface_permissions": sorted({code for menu in menus for code in menu.interfaces}),
    }
