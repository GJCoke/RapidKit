# apps/backend/plugins/user/tests/test_scope_declarations.py
"""用户资源的数据范围与字段组声明通过目录校验。"""

from plugin_permission.catalog.registry import build_catalog
from plugin_user.permissions import RESOURCES
from rapidkit_framework.plugin import PluginManifest


def test_user_resource_declarations_are_valid():
    catalog = build_catalog([PluginManifest(name="user", version="0", resources=RESOURCES)], {})
    user = catalog.resources["user"]
    assert [s.key for s in user.data_scopes] == ["dept_subtree", "dept", "self"]
    assert [(g.key, g.fields, g.modes) for g in user.field_groups] == [
        ("contact", ("phone", "email"), ("masked", "hidden")),
        ("remark", ("remark",), ("hidden",)),
    ]
