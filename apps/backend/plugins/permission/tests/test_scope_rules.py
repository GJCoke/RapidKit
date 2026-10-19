# apps/backend/plugins/permission/tests/test_scope_rules.py
"""范围规则：失效收紧、多角色合并、保存校验、条件构建、字段规则映射。"""

from uuid import uuid4

import pytest
from rapidkit_framework.exceptions import AppException
from rapidkit_framework.scopes import ScopeContext

from plugin_permission.scope_rules import (
    InvalidScope,
    build_condition,
    ensure_valid_scopes,
    field_rules_for,
    merge_role_scopes,
    needs_dept_subtree,
    resolve_role_scopes,
    restricted_fields,
)
from plugin_permission.status_codes import RbacStatusCode
from plugins.permission.tests.catalog_fixtures import ScopedFixtureItem, make_scoped_catalog

CATALOG = make_scoped_catalog()


def test_resolve_keeps_declared_values_and_drops_defaults():
    resolved = resolve_role_scopes(
        {"item": "dept", "plain": "all"},
        {"item": {"contact": "masked", "note": "visible"}},
        CATALOG,
    )
    assert resolved.data_scopes == {"item": "dept"}
    assert resolved.field_modes == {"item": {"contact": "masked"}}
    assert resolved.invalid == []


def test_resolve_unknown_scope_falls_back_to_narrowest():
    resolved = resolve_role_scopes({"item": "region"}, {}, CATALOG)
    assert resolved.data_scopes == {"item": "self"}
    assert resolved.invalid == [InvalidScope(resource="item", group=None, stored="region", effective="self")]


def test_resolve_resource_without_scopes_becomes_all():
    resolved = resolve_role_scopes({"plain": "dept", "ghost": "self"}, {}, CATALOG)
    assert resolved.data_scopes == {}
    assert resolved.invalid == [
        InvalidScope(resource="plain", group=None, stored="dept", effective="all"),
        InvalidScope(resource="ghost", group=None, stored="self", effective="all"),
    ]


def test_resolve_unknown_group_is_ignored_and_disallowed_mode_is_tightened():
    resolved = resolve_role_scopes({}, {"item": {"private": "hidden", "note": "masked"}}, CATALOG)
    assert resolved.field_modes == {"item": {"note": "hidden"}}
    assert resolved.invalid == [
        InvalidScope(resource="item", group="private", stored="hidden", effective="visible"),
        InvalidScope(resource="item", group="note", stored="masked", effective="hidden"),
    ]


def test_merge_unions_scopes_in_declaration_order_and_all_short_circuits():
    self_role = resolve_role_scopes({"item": "self"}, {}, CATALOG)
    dept_role = resolve_role_scopes({"item": "dept"}, {}, CATALOG)
    open_role = resolve_role_scopes({}, {}, CATALOG)
    assert merge_role_scopes([self_role, dept_role], CATALOG)[0] == {"item": ["dept", "self"]}
    assert merge_role_scopes([self_role, open_role], CATALOG)[0] == {}
    assert merge_role_scopes([], CATALOG) == ({}, {})


def test_merge_field_modes_takes_most_permissive():
    hidden = resolve_role_scopes({}, {"item": {"contact": "hidden", "note": "hidden"}}, CATALOG)
    masked = resolve_role_scopes({}, {"item": {"contact": "masked", "note": "hidden"}}, CATALOG)
    visible = resolve_role_scopes({}, {}, CATALOG)
    assert merge_role_scopes([hidden, masked], CATALOG)[1] == {"item": {"contact": "masked", "note": "hidden"}}
    assert merge_role_scopes([hidden, visible], CATALOG)[1] == {}


def test_ensure_valid_scopes_normalizes():
    data, fields = ensure_valid_scopes(
        {"item": "dept", "plain": "all"},
        {"item": {"contact": "hidden", "note": "visible"}},
        CATALOG,
        error=RbacStatusCode.INVALID_DATA_SCOPE,
    )
    assert data == {"item": "dept"}
    assert fields == {"item": {"contact": "hidden"}}


def test_ensure_valid_scopes_rejects_unknown_items():
    with pytest.raises(AppException) as exc:
        ensure_valid_scopes(
            {"item": "region", "ghost": "all"},
            {"item": {"note": "masked", "private": "hidden"}},
            CATALOG,
            error=RbacStatusCode.INVALID_DATA_SCOPE,
        )
    assert exc.value.status_code_enum is RbacStatusCode.INVALID_DATA_SCOPE
    assert exc.value.data == {"items": ["item=region", "ghost=all", "item.note=masked", "item.private=hidden"]}


def test_build_condition_ors_selected_scopes():
    resource = CATALOG.resources["item"]
    ctx = ScopeContext(user_id=uuid4(), department_id=uuid4())
    assert "OR" not in str(build_condition(resource, ["self"], ctx))
    assert " OR " in str(build_condition(resource, ["dept", "self"], ctx))
    assert needs_dept_subtree(resource, ["dept_subtree"]) is True
    assert needs_dept_subtree(resource, ["dept", "self"]) is False


def test_field_rules_and_restricted_fields():
    modes = {"item": {"contact": "masked", "note": "hidden"}}
    assert field_rules_for(CATALOG, modes) == {
        ScopedFixtureItem: {"phone": "masked", "email": "masked", "remark": "hidden"}
    }
    assert restricted_fields(CATALOG, modes) == {"item": {"phone": "masked", "email": "masked", "remark": "hidden"}}
