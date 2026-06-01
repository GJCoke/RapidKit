"""Unit tests for policy simulator schemas and rule validation."""

from uuid import UUID

import pytest
from pydantic import ValidationError

from plugin_permission.data_policy.schemas import (
    DataPolicyCreate,
    DataPolicyUpdate,
    PolicyAppliedDetail,
    PolicySimulateRequest,
    PolicySimulateResponse,
)


class TestSimulatorSchemas:
    def test_simulate_request_validation(self):
        req = PolicySimulateRequest(
            policy_ids=[UUID("00000000-0000-0000-0000-000000000001")],
            target_user_id=UUID("00000000-0000-0000-0000-000000000002"),
            preview_limit=10,
        )
        assert req.preview_limit == 10
        assert len(req.policy_ids) == 1

    def test_simulate_request_default_limit(self):
        req = PolicySimulateRequest(
            policy_ids=[UUID("00000000-0000-0000-0000-000000000001")],
            target_user_id=UUID("00000000-0000-0000-0000-000000000002"),
        )
        assert req.preview_limit == 20

    def test_simulate_response_structure(self):
        resp = PolicySimulateResponse(
            target_model="user_users",
            target_model_label="User",
            total_count=100,
            filtered_count=42,
            excluded_count=58,
            preview_rows=[{"id": "abc", "name": "test"}],
            excluded_rows=[],
            generated_sql="id = 'abc'",
            policies_applied=[],
        )
        assert resp.excluded_count == 58

    def test_policy_applied_detail(self):
        detail = PolicyAppliedDetail(
            policy_id=UUID("00000000-0000-0000-0000-000000000001"),
            policy_name="Test Policy",
            matched_count=42,
            sql_fragment="id = 'abc'",
        )
        assert detail.matched_count == 42


class TestRuleValidation:
    """Rule field must have valid structure."""

    def test_valid_condition_rule(self):
        policy = DataPolicyCreate(
            name="test",
            target_model="users",
            rule={"type": "condition", "field": "id", "operator": "eq", "value": "${user.id}"},
        )
        assert policy.rule["type"] == "condition"

    def test_valid_group_rule(self):
        policy = DataPolicyCreate(
            name="test",
            target_model="users",
            rule={
                "type": "group",
                "logic": "AND",
                "conditions": [
                    {"type": "condition", "field": "status", "operator": "eq", "value": "1"},
                ],
            },
        )
        assert policy.rule["type"] == "group"

    def test_invalid_rule_missing_type(self):
        with pytest.raises(ValidationError):
            DataPolicyCreate(name="test", target_model="users", rule={"field": "id"})

    def test_invalid_rule_unknown_type(self):
        with pytest.raises(ValidationError):
            DataPolicyCreate(name="test", target_model="users", rule={"type": "unknown"})

    def test_invalid_condition_missing_field(self):
        with pytest.raises(ValidationError):
            DataPolicyCreate(
                name="test",
                target_model="users",
                rule={"type": "condition", "operator": "eq", "value": "1"},
            )

    def test_invalid_group_bad_logic(self):
        with pytest.raises(ValidationError):
            DataPolicyCreate(
                name="test",
                target_model="users",
                rule={"type": "group", "logic": "XOR", "conditions": []},
            )

    def test_update_rule_none_is_valid(self):
        update = DataPolicyUpdate(name="new_name")
        assert update.rule is None

    def test_update_rule_validated(self):
        with pytest.raises(ValidationError):
            DataPolicyUpdate(rule={"type": "bad"})
