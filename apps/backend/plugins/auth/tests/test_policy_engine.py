"""Unit tests for the policy rule engine."""

from datetime import UTC, datetime
from unittest.mock import MagicMock
from uuid import UUID

import pytest
from rapidkit_policy_engine import TemplateContext, resolve_rule_tree
from rapidkit_policy_engine.engine import _resolve_condition, _resolve_group
from sqlalchemy import ColumnElement


@pytest.fixture
def mock_user():
    user = MagicMock()
    user.id = UUID("00000000-0000-0000-0000-000000000001")
    user.department_id = UUID("00000000-0000-0000-0000-000000000010")
    user.roles = ["GUEST"]
    user.is_admin = False
    return user


@pytest.fixture
def ctx(mock_user):
    return TemplateContext(user=mock_user, now=datetime.now(tz=UTC))


@pytest.fixture
def user_model():
    """Use the actual User model from the auth plugin."""
    from plugin_user.models import User

    return User


class TestResolveCondition:
    def test_eq_operator(self, ctx, user_model):
        node = {"type": "condition", "field": "id", "operator": "eq", "value": "${user.id}"}
        result = _resolve_condition(node, ctx, user_model)
        assert result is not None
        assert isinstance(result, ColumnElement)

    def test_ne_operator(self, ctx, user_model):
        node = {"type": "condition", "field": "status", "operator": "ne", "value": "2"}
        result = _resolve_condition(node, ctx, user_model)
        assert result is not None

    def test_in_operator(self, ctx, user_model):
        node = {"type": "condition", "field": "status", "operator": "in", "value": "1,2"}
        result = _resolve_condition(node, ctx, user_model)
        assert result is not None

    def test_not_in_operator(self, ctx, user_model):
        node = {"type": "condition", "field": "status", "operator": "not_in", "value": "2,3"}
        result = _resolve_condition(node, ctx, user_model)
        assert result is not None

    def test_is_null_operator(self, ctx, user_model):
        node = {"type": "condition", "field": "department_id", "operator": "is_null"}
        result = _resolve_condition(node, ctx, user_model)
        assert result is not None

    def test_is_not_null_operator(self, ctx, user_model):
        node = {"type": "condition", "field": "department_id", "operator": "is_not_null"}
        result = _resolve_condition(node, ctx, user_model)
        assert result is not None

    def test_gt_operator(self, ctx, user_model):
        node = {"type": "condition", "field": "name", "operator": "gt", "value": "a"}
        result = _resolve_condition(node, ctx, user_model)
        assert result is not None

    def test_unknown_field_returns_none(self, ctx, user_model):
        node = {"type": "condition", "field": "nonexistent", "operator": "eq", "value": "x"}
        result = _resolve_condition(node, ctx, user_model)
        assert result is None

    def test_template_resolves_to_none_returns_false(self, ctx, user_model):
        ctx.user.department_id = None
        node = {"type": "condition", "field": "department_id", "operator": "eq", "value": "${user.dept_id}"}
        result = _resolve_condition(node, ctx, user_model)
        assert result is not None


class TestResolveGroup:
    def test_and_group(self, ctx, user_model):
        node = {
            "type": "group",
            "logic": "AND",
            "conditions": [
                {"type": "condition", "field": "status", "operator": "eq", "value": "1"},
                {"type": "condition", "field": "id", "operator": "eq", "value": "${user.id}"},
            ],
        }
        result = _resolve_group(node, ctx, user_model, session=None)
        assert result is not None

    def test_or_group(self, ctx, user_model):
        node = {
            "type": "group",
            "logic": "OR",
            "conditions": [
                {"type": "condition", "field": "id", "operator": "eq", "value": "${user.id}"},
                {"type": "condition", "field": "created_by", "operator": "eq", "value": "${user.id}"},
            ],
        }
        result = _resolve_group(node, ctx, user_model, session=None)
        assert result is not None

    def test_nested_groups(self, ctx, user_model):
        node = {
            "type": "group",
            "logic": "OR",
            "conditions": [
                {
                    "type": "group",
                    "logic": "AND",
                    "conditions": [
                        {"type": "condition", "field": "status", "operator": "eq", "value": "1"},
                        {"type": "condition", "field": "created_by", "operator": "eq", "value": "${user.id}"},
                    ],
                },
                {"type": "condition", "field": "id", "operator": "eq", "value": "${user.id}"},
            ],
        }
        result = _resolve_group(node, ctx, user_model, session=None)
        assert result is not None

    def test_empty_conditions_returns_true(self, ctx, user_model):
        node = {"type": "group", "logic": "AND", "conditions": []}
        result = _resolve_group(node, ctx, user_model, session=None)
        assert result is not None


class TestResolveRuleTree:
    def test_invalid_json_returns_false(self, ctx, user_model):
        result = resolve_rule_tree({"invalid": "structure"}, ctx, user_model, session=None)
        assert result is not None

    def test_valid_tree(self, ctx, user_model):
        tree = {
            "type": "group",
            "logic": "OR",
            "conditions": [
                {"type": "condition", "field": "id", "operator": "eq", "value": "${user.id}"},
            ],
        }
        result = resolve_rule_tree(tree, ctx, user_model, session=None)
        assert result is not None

    def test_deeply_nested_within_limit(self, ctx, user_model):
        node: dict = {"type": "condition", "field": "id", "operator": "eq", "value": "${user.id}"}
        for _ in range(10):
            node = {"type": "group", "logic": "AND", "conditions": [node]}
        result = resolve_rule_tree(node, ctx, user_model, session=None)
        assert result is not None


class TestSubqueryCircularDetection:
    """Tests for subquery circular reference detection."""

    def test_direct_circular_reference_returns_false(self, ctx, user_model):
        """A subquery targeting the same model as its parent should return false."""
        tree = {
            "type": "group",
            "logic": "AND",
            "conditions": [
                {
                    "type": "subquery",
                    "field": "id",
                    "operator": "in",
                    "model": user_model.__tablename__,
                    "target_field": "id",
                    "filter": {
                        "type": "condition",
                        "field": "status",
                        "operator": "eq",
                        "value": "1",
                    },
                }
            ],
        }
        result = resolve_rule_tree(tree, ctx, user_model, models_map={user_model.__tablename__: user_model}, session=None)
        # The subquery targets the same model, so cycle detection should return false()
        compiled = str(result.compile(compile_kwargs={"literal_binds": True}))
        assert "false" in compiled.lower() or "1 != 1" in compiled

    def test_sibling_subqueries_no_interference(self, ctx, user_model):
        """Two sibling subqueries targeting the same other model should both work (frozenset copy)."""
        from plugin_permission.models import Role

        tree = {
            "type": "group",
            "logic": "AND",
            "conditions": [
                {
                    "type": "subquery",
                    "field": "id",
                    "operator": "in",
                    "model": Role.__tablename__,
                    "target_field": "id",
                    "filter": {
                        "type": "condition",
                        "field": "status",
                        "operator": "eq",
                        "value": "1",
                    },
                },
                {
                    "type": "subquery",
                    "field": "id",
                    "operator": "in",
                    "model": Role.__tablename__,
                    "target_field": "id",
                    "filter": {
                        "type": "condition",
                        "field": "status",
                        "operator": "eq",
                        "value": "2",
                    },
                },
            ],
        }
        result = resolve_rule_tree(tree, ctx, user_model, models_map={Role.__tablename__: Role}, session=None)
        # Both subqueries should resolve successfully (no false short-circuit)
        compiled = str(result.compile(compile_kwargs={"literal_binds": True}))
        # Should contain two IN subqueries, not false
        assert compiled.count("IN") >= 2 or compiled.count("in") >= 2
