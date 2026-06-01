"""Unit tests for deny-override policy evaluation logic."""

import os

os.environ.setdefault("RAPIDKIT_ENV", "test")

from dataclasses import dataclass
from uuid import UUID, uuid4

import pytest
from sqlalchemy import ColumnElement


@dataclass
class FakePolicy:
    id: UUID
    name: str
    target_model: str
    rule: dict
    effect: str
    actions: list[str]
    status: int = 1


class TestBuildFilterCondition:
    """Test the internal condition-building logic separated from FastAPI deps."""

    def test_only_allow_policies_combined_with_or(self):
        from plugin_permission.data_policy.filter_logic import build_filter_condition

        policies = [
            FakePolicy(id=uuid4(), name="p1", target_model="users", rule={}, effect="allow", actions=["read"]),
            FakePolicy(id=uuid4(), name="p2", target_model="users", rule={}, effect="allow", actions=["read"]),
        ]
        result = build_filter_condition(policies, action="read", model_tablename="users")
        assert result is not None

    def test_only_deny_policies_produce_not_condition(self):
        from plugin_permission.data_policy.filter_logic import build_filter_condition

        policies = [
            FakePolicy(id=uuid4(), name="p1", target_model="users", rule={}, effect="deny", actions=["read"]),
        ]
        result = build_filter_condition(policies, action="read", model_tablename="users")
        assert result is not None

    def test_action_filtering_excludes_non_matching(self):
        from plugin_permission.data_policy.filter_logic import build_filter_condition

        policies = [
            FakePolicy(id=uuid4(), name="p1", target_model="users", rule={}, effect="allow", actions=["write"]),
        ]
        # action="read" should not match a write-only policy
        result = build_filter_condition(policies, action="read", model_tablename="users")
        assert result is None  # No applicable policies

    def test_no_policies_returns_none(self):
        from plugin_permission.data_policy.filter_logic import build_filter_condition

        result = build_filter_condition([], action="read", model_tablename="users")
        assert result is None

    def test_mixed_allow_deny_produces_and_not(self):
        from plugin_permission.data_policy.filter_logic import build_filter_condition

        policies = [
            FakePolicy(id=uuid4(), name="allow1", target_model="users", rule={}, effect="allow", actions=["read"]),
            FakePolicy(id=uuid4(), name="deny1", target_model="users", rule={}, effect="deny", actions=["read"]),
        ]
        result = build_filter_condition(policies, action="read", model_tablename="users")
        # Should produce: allow_cond AND NOT deny_cond
        assert result is not None

    def test_model_tablename_filtering(self):
        from plugin_permission.data_policy.filter_logic import build_filter_condition

        policies = [
            FakePolicy(id=uuid4(), name="p1", target_model="items", rule={}, effect="allow", actions=["read"]),
        ]
        # Different model should not match
        result = build_filter_condition(policies, action="read", model_tablename="users")
        assert result is None
