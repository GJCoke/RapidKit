# packages/framework/tests/test_scope_declarations.py
"""数据范围与字段组声明测试。"""

from uuid import UUID, uuid4

import pytest
from rapidkit_framework.plugin import ResourceDef
from rapidkit_framework.scopes import (
    DataScopeDef,
    FieldGroupDef,
    ScopeContext,
    creator,
    dept,
    dept_subtree,
    self_only,
)
from sqlalchemy import false
from sqlmodel import Field, SQLModel


class ScopeDoc(SQLModel, table=True):
    __tablename__ = "framework_scope_docs"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    owner_id: UUID | None = None
    department_id: UUID | None = None
    phone: str | None = None


def test_factories_use_default_keys_and_labels():
    scopes = [
        dept_subtree(ScopeDoc.department_id),
        dept(ScopeDoc.department_id),
        self_only(ScopeDoc.id),
        creator(ScopeDoc.owner_id),
    ]
    assert [(s.key, s.label) for s in scopes] == [
        ("dept_subtree", "本部门及以下"),
        ("dept", "本部门"),
        ("self", "仅本人"),
        ("creator", "本人创建"),
    ]
    assert [s.needs_dept_subtree for s in scopes] == [True, False, False, False]
    assert scopes[0].columns == (ScopeDoc.department_id,)


def test_factory_key_and_label_can_be_overridden():
    scope = dept(ScopeDoc.department_id, key="own_dept", label="仅本部门")
    assert (scope.key, scope.label) == ("own_dept", "仅本部门")


def test_dept_subtree_builds_in_clause_or_false():
    scope = dept_subtree(ScopeDoc.department_id)
    root = uuid4()
    assert str(scope.build(ScopeContext(user_id=uuid4()))) == str(false())
    expr = scope.build(ScopeContext(user_id=uuid4(), department_id=root, dept_subtree_ids=(root,)))
    assert "framework_scope_docs.department_id IN" in str(expr)


def test_dept_without_department_is_false():
    scope = dept(ScopeDoc.department_id)
    assert str(scope.build(ScopeContext(user_id=uuid4()))) == str(false())
    expr = scope.build(ScopeContext(user_id=uuid4(), department_id=uuid4()))
    assert str(expr) == "framework_scope_docs.department_id = :department_id_1"


def test_self_only_and_creator_compare_with_user_id():
    ctx = ScopeContext(user_id=uuid4())
    assert str(self_only(ScopeDoc.id).build(ctx)) == "framework_scope_docs.id = :id_1"
    assert str(creator(ScopeDoc.owner_id).build(ctx)) == "framework_scope_docs.owner_id = :owner_id_1"


@pytest.mark.parametrize("key", ["all", "Dept", "1dept", ""])
def test_invalid_or_reserved_scope_key_rejected(key):
    with pytest.raises(ValueError):
        DataScopeDef(key=key, label="x", build=lambda ctx: false())


def test_field_group_defaults_and_normalizes_tuples():
    group = FieldGroupDef("contact", "联系方式", fields=["phone", "email"])  # ty: ignore[invalid-argument-type]
    assert group.fields == ("phone", "email")
    assert group.modes == ("masked", "hidden")


@pytest.mark.parametrize(
    "kwargs",
    [
        {"fields": ()},
        {"fields": ("phone", "phone")},
        {"fields": ("phone",), "modes": ()},
        {"fields": ("phone",), "modes": ("visible",)},
        {"fields": ("phone",), "modes": ("hidden", "hidden")},
    ],
)
def test_invalid_field_group_rejected(kwargs):
    with pytest.raises(ValueError):
        FieldGroupDef("contact", "联系方式", **kwargs)


def test_resource_def_accepts_lists_and_defaults_to_empty():
    plain = ResourceDef(key="doc", label="文档")
    assert plain.data_scopes == () and plain.field_groups == ()
    scoped = ResourceDef(
        key="doc",
        label="文档",
        model=ScopeDoc,
        data_scopes=[self_only(ScopeDoc.id)],  # ty: ignore[invalid-argument-type]
        field_groups=[FieldGroupDef("contact", "联系方式", fields=("phone",))],  # ty: ignore[invalid-argument-type]
    )
    assert isinstance(scoped.data_scopes, tuple) and isinstance(scoped.field_groups, tuple)
