# apps/backend/tests/test_permission_code_mapping.py
"""C7 历史对照表中未退役的权限码必须仍由目录声明。"""

from plugin_permission.catalog.loader import catalog_from_app
from src._permission_code_mapping import LEGACY_BUTTON_CODES, LEGACY_MENU_CODES


def test_every_mapping_target_is_declared(loaded_app):
    catalog, _ = catalog_from_app(loaded_app)
    targets = {
        code
        for code in {*LEGACY_BUTTON_CODES.values(), *LEGACY_MENU_CODES.values()}
        if code.split(":", 1)[0] not in {"data-policy", "field-policy", "script"}
    }
    missing = sorted(targets - set(catalog.codes))
    assert missing == [], f"P1 未声明这些码：{missing}"
