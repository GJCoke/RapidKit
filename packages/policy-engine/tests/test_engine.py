"""Tests for the policy engine rule resolver."""

from datetime import UTC, datetime
from uuid import uuid4

from rapidkit_policy_engine.engine import resolve_rule_tree
from rapidkit_policy_engine.template import TemplateContext
from sqlmodel import Field, SQLModel


class FakeUser:
    def __init__(self):
        self.id = uuid4()
        self.is_admin = False
        self.roles = ["user"]
        self.department_id = uuid4()


class SampleModel(SQLModel, table=True):
    __tablename__ = "test_sample"
    id: int = Field(primary_key=True)
    name: str = ""
    owner_id: str = ""


def test_resolve_simple_eq_condition():
    ctx = TemplateContext(user=FakeUser(), now=datetime.now(tz=UTC))
    tree = {
        "type": "condition",
        "field": "name",
        "operator": "eq",
        "value": "hello",
    }
    clause = resolve_rule_tree(tree, ctx, SampleModel)
    compiled = clause.compile(compile_kwargs={"literal_binds": True})
    assert "test_sample.name = 'hello'" in str(compiled)


def test_resolve_invalid_tree_returns_false():
    ctx = TemplateContext(user=FakeUser(), now=datetime.now(tz=UTC))
    clause = resolve_rule_tree({}, ctx, SampleModel)
    assert "false" in str(clause.compile(compile_kwargs={"literal_binds": True})).lower()


def test_resolve_group_and():
    ctx = TemplateContext(user=FakeUser(), now=datetime.now(tz=UTC))
    tree = {
        "type": "group",
        "logic": "AND",
        "conditions": [
            {"type": "condition", "field": "name", "operator": "eq", "value": "a"},
            {"type": "condition", "field": "owner_id", "operator": "eq", "value": "b"},
        ],
    }
    clause = resolve_rule_tree(tree, ctx, SampleModel)
    compiled_str = str(clause.compile(compile_kwargs={"literal_binds": True}))
    assert "test_sample.name = 'a'" in compiled_str
    assert "test_sample.owner_id = 'b'" in compiled_str


def test_null_eq_generates_is_null():
    """When template resolves to None, eq should produce IS NULL."""
    user = FakeUser()
    user.department_id = None
    ctx = TemplateContext(user=user, now=datetime.now(tz=UTC))
    tree = {
        "type": "condition",
        "field": "name",
        "operator": "eq",
        "value": "${user.dept_id}",
    }
    clause = resolve_rule_tree(tree, ctx, SampleModel)
    compiled_str = str(clause.compile(compile_kwargs={"literal_binds": True}))
    assert "IS NULL" in compiled_str.upper()


def test_null_ne_generates_is_not_null():
    """When template resolves to None, ne should produce IS NOT NULL."""
    user = FakeUser()
    user.department_id = None
    ctx = TemplateContext(user=user, now=datetime.now(tz=UTC))
    tree = {
        "type": "condition",
        "field": "name",
        "operator": "ne",
        "value": "${user.dept_id}",
    }
    clause = resolve_rule_tree(tree, ctx, SampleModel)
    compiled_str = str(clause.compile(compile_kwargs={"literal_binds": True}))
    assert "IS NOT NULL" in compiled_str.upper()


def test_null_gt_generates_false():
    """When template resolves to None, comparison operators like gt should deny."""
    user = FakeUser()
    user.department_id = None
    ctx = TemplateContext(user=user, now=datetime.now(tz=UTC))
    tree = {
        "type": "condition",
        "field": "name",
        "operator": "gt",
        "value": "${user.dept_id}",
    }
    clause = resolve_rule_tree(tree, ctx, SampleModel)
    compiled_str = str(clause.compile(compile_kwargs={"literal_binds": True})).lower()
    assert "false" in compiled_str or "1 != 1" in compiled_str
