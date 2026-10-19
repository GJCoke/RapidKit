"""导出为代码声明测试。"""

import ast

from plugin_permission.catalog.extensions import CatalogExtension, ExtensionState
from plugin_permission.extension.export import render_export


def test_render_export_groups_active_extensions():
    states = (
        ExtensionState(
            CatalogExtension(kind="custom_code", code="user:audit", resource="user", label="审计", abac_action="read"),
            "active",
        ),
        ExtensionState(CatalogExtension(kind="depends", code="user:update", depends_on="position:read"), "active"),
        ExtensionState(
            CatalogExtension(kind="route_binding", code="user:audit", route_key="GET:/api/v1/positions/all"), "active"
        ),
        ExtensionState(CatalogExtension(kind="depends", code="user:update", depends_on="user:read"), "cleanable"),
        ExtensionState(CatalogExtension(kind="route_binding", code="ghost:read", route_key="GET:/x"), "invalid"),
    )
    text = render_export(states, {"GET:/api/v1/positions/all": "position:read"}, generated_at="2026-10-17 10:00:00")

    assert 'PermissionCodeDef(code="user:audit", label="审计", abac_action="read"),' in text
    assert '# user:update → depends 追加 "position:read"' in text
    assert '# GET:/api/v1/positions/all  当前 Require("position:read")  扩展允许: user:audit' in text
    assert "ghost:read" not in text
    assert '"user:read"' not in text


def test_render_export_without_active_extensions():
    assert render_export((), {}, generated_at="2026-10-17 10:00:00").endswith("# 当前没有生效的扩展\n")


def test_export_escapes_custom_labels_as_a_string_literal():
    label = '引号"与换行\n不会成为代码'
    state = ExtensionState(CatalogExtension(kind="custom_code", code="user:audit", resource="user", label=label, abac_action="read"), "active")
    source = render_export([state], {}, generated_at="2026-10-17")
    call = ast.parse(source).body[0].value.elts[0]
    assert ast.literal_eval(next(keyword.value for keyword in call.keywords if keyword.arg == "label")) == label
