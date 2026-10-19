# apps/backend/tests/test_policy_removal.py
"""旧数据策略 / 字段策略已从模型、目录、菜单与种子中移除。"""

import importlib.util

from plugin_permission import register
from plugin_permission.models import Role
from plugin_permission.package.models import PermissionPackage
from rapidkit_framework.plugin import ResourceDef
from src._menu_seeds import build_menus


def test_policy_modules_are_gone():
    for name in ("plugin_permission.data_policy", "plugin_permission.field_guard", "rapidkit_policy_engine"):
        assert importlib.util.find_spec(name) is None, name


def test_policy_columns_and_codes_are_gone():
    assert "data_policy_ids" not in Role.model_fields and "field_policy_ids" not in Role.model_fields
    assert "data_policy_ids" not in PermissionPackage.model_fields
    codes = {code.code for code in register().permission_codes}
    assert not {code for code in codes if code.startswith(("data-policy:", "field-policy:"))}
    assert "data_scope" not in ResourceDef.__dataclass_fields__ and "fields" not in ResourceDef.__dataclass_fields__


def test_policy_menus_are_gone():
    names = {menu.route_name for menu in build_menus()}
    assert not names & {"manage_data-policy", "manage_field-policy"}
