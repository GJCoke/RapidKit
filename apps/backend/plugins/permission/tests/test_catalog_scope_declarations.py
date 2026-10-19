# apps/backend/plugins/permission/tests/test_catalog_scope_declarations.py
"""目录对数据范围 / 字段组声明的启动校验、摘要与目录响应。"""

import pytest
from rapidkit_framework.plugin import PluginManifest, ResourceDef
from rapidkit_framework.scopes import FieldGroupDef, self_only

from plugin_permission.catalog.registry import CatalogError, build_catalog
from plugin_permission.catalog.services import build_catalog_response
from plugins.permission.tests.catalog_fixtures import (
    OtherFixtureItem,
    ScopedFixtureItem,
    make_scoped_catalog,
    scoped_resource,
)


def _build(resource: ResourceDef):
    return build_catalog([PluginManifest(name="t", version="0", resources=[resource])], {})


def test_valid_declarations_build():
    catalog = make_scoped_catalog()
    assert [s.key for s in catalog.resources["item"].data_scopes] == ["dept_subtree", "dept", "self"]


def test_scopes_without_model_fail():
    with pytest.raises(CatalogError, match="has no model"):
        _build(scoped_resource(model=None))


def test_scope_column_outside_model_fails():
    with pytest.raises(CatalogError, match="references a column outside model"):
        _build(scoped_resource(data_scopes=(self_only(OtherFixtureItem.owner_id),)))


def test_duplicate_scope_key_fails():
    scope = self_only(ScopedFixtureItem.owner_id)
    with pytest.raises(CatalogError, match="duplicate data scope 'self'"):
        _build(scoped_resource(data_scopes=(scope, scope)))


def test_unknown_field_fails():
    group = FieldGroupDef("contact", "联系方式", fields=("mobile",))
    with pytest.raises(CatalogError, match="unknown field 'mobile'"):
        _build(scoped_resource(field_groups=(group,)))


def test_field_in_two_groups_fails():
    groups = (
        FieldGroupDef("contact", "联系方式", fields=("phone",)),
        FieldGroupDef("private", "隐私", fields=("phone",)),
    )
    with pytest.raises(CatalogError, match="belongs to field groups 'contact' and 'private'"):
        _build(scoped_resource(field_groups=groups))


def test_duplicate_group_key_fails():
    groups = (
        FieldGroupDef("contact", "联系方式", fields=("phone",)),
        FieldGroupDef("contact", "联系方式2", fields=("email",)),
    )
    with pytest.raises(CatalogError, match="duplicate field group 'contact'"):
        _build(scoped_resource(field_groups=groups))


def test_digest_changes_with_scope_declarations():
    base = make_scoped_catalog().digest()
    relabeled = make_scoped_catalog(
        scoped_resource(data_scopes=(self_only(ScopedFixtureItem.owner_id, label="只看自己"),))
    ).digest()
    regrouped = make_scoped_catalog(
        scoped_resource(field_groups=(FieldGroupDef("contact", "联系方式", fields=("phone",)),))
    ).digest()
    assert len({base, relabeled, regrouped}) == 3


def test_catalog_response_exposes_scopes_and_groups():
    data = build_catalog_response(make_scoped_catalog()).model_dump(by_alias=True)
    item = next(r for r in data["resources"] if r["key"] == "item")
    assert item == {
        "key": "item",
        "label": "条目",
        "dataScopes": [
            {"key": "dept_subtree", "label": "本部门及以下"},
            {"key": "dept", "label": "本部门"},
            {"key": "self", "label": "仅本人"},
        ],
        "fieldGroups": [
            {"key": "contact", "label": "联系方式", "fields": ["phone", "email"], "modes": ["masked", "hidden"]},
            {"key": "note", "label": "备注", "fields": ["remark"], "modes": ["hidden"]},
        ],
    }
    plain = next(r for r in data["resources"] if r["key"] == "plain")
    assert plain == {"key": "plain", "label": "普通", "dataScopes": [], "fieldGroups": []}
