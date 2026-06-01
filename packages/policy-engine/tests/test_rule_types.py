import pytest
from pydantic import ValidationError

from rapidkit_policy_engine.rule_types import (
    ConditionNode,
    GroupNode,
    SubqueryNode,
    parse_rule,
)


class TestConditionNode:
    def test_valid(self):
        node = ConditionNode(type="condition", field="status", operator="eq", value="active")
        assert node.field == "status"
        assert node.operator == "eq"
        assert node.value == "active"

    def test_empty_field_raises(self):
        with pytest.raises(ValidationError, match="field must not be empty"):
            ConditionNode(type="condition", field="", operator="eq", value="x")

    def test_whitespace_field_raises(self):
        with pytest.raises(ValidationError, match="field must not be empty"):
            ConditionNode(type="condition", field="   ", operator="eq", value="x")

    def test_empty_operator_raises(self):
        with pytest.raises(ValidationError, match="operator must not be empty"):
            ConditionNode(type="condition", field="status", operator="", value="x")


class TestGroupNode:
    def test_valid(self):
        node = GroupNode(
            type="group",
            logic="AND",
            conditions=[
                ConditionNode(type="condition", field="a", operator="eq", value="1"),
            ],
        )
        assert node.logic == "AND"
        assert len(node.conditions) == 1

    def test_invalid_logic_raises(self):
        with pytest.raises(ValidationError):
            GroupNode(
                type="group",
                logic="XOR",  # type: ignore[arg-type]
                conditions=[],
            )


class TestSubqueryNode:
    def test_valid(self):
        node = SubqueryNode(
            type="subquery",
            field="org_id",
            model="Organization",
        )
        assert node.operator == "in"
        assert node.target_field == "id"
        assert node.filter is None

    def test_empty_model_raises(self):
        with pytest.raises(ValidationError, match="model must not be empty"):
            SubqueryNode(type="subquery", field="org_id", model="")

    def test_empty_field_raises(self):
        with pytest.raises(ValidationError, match="field must not be empty"):
            SubqueryNode(type="subquery", field="", model="Org")


class TestParseRule:
    def test_condition_dict(self):
        result = parse_rule({"type": "condition", "field": "x", "operator": "eq", "value": "1"})
        assert isinstance(result, ConditionNode)

    def test_nested_group(self):
        result = parse_rule({
            "type": "group",
            "logic": "OR",
            "conditions": [
                {"type": "condition", "field": "a", "operator": "eq", "value": "1"},
                {"type": "condition", "field": "b", "operator": "ne", "value": "2"},
            ],
        })
        assert isinstance(result, GroupNode)
        assert len(result.conditions) == 2

    def test_invalid_type_raises(self):
        with pytest.raises(ValidationError):
            parse_rule({"type": "unknown", "field": "x"})

    def test_empty_dict_raises(self):
        with pytest.raises(ValidationError):
            parse_rule({})
