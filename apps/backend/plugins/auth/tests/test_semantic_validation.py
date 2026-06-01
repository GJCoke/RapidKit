"""Tests for policy semantic validation."""

from unittest.mock import patch

import pytest
from sqlmodel import Field, SQLModel

from plugin_permission.data_policy.services import validate_policy_semantics


class FakeModel(SQLModel, table=True):
    __tablename__ = "fake_model"
    id: int = Field(primary_key=True)
    name: str = ""
    status: int = 0


class TestSemanticValidation:
    def test_valid_rule_and_model(self):
        with patch("plugin_auth.data_policy.services.get_loaded_models", return_value={"fake_model": FakeModel}):
            errors = validate_policy_semantics(
                rule={"type": "condition", "field": "name", "operator": "eq", "value": "test"},
                target_model="fake_model",
            )
        assert errors == []

    def test_invalid_target_model(self):
        with patch("plugin_auth.data_policy.services.get_loaded_models", return_value={}):
            errors = validate_policy_semantics(
                rule={"type": "condition", "field": "id", "operator": "eq", "value": "1"},
                target_model="nonexistent_table",
            )
        assert any("not registered" in e for e in errors)

    def test_invalid_field(self):
        with patch("plugin_auth.data_policy.services.get_loaded_models", return_value={"fake_model": FakeModel}):
            errors = validate_policy_semantics(
                rule={"type": "condition", "field": "nonexistent_field", "operator": "eq", "value": "1"},
                target_model="fake_model",
            )
        assert any("nonexistent_field" in e for e in errors)

    def test_valid_group_with_valid_fields(self):
        with patch("plugin_auth.data_policy.services.get_loaded_models", return_value={"fake_model": FakeModel}):
            errors = validate_policy_semantics(
                rule={
                    "type": "group",
                    "logic": "AND",
                    "conditions": [
                        {"type": "condition", "field": "name", "operator": "eq", "value": "x"},
                        {"type": "condition", "field": "status", "operator": "gt", "value": "0"},
                    ],
                },
                target_model="fake_model",
            )
        assert errors == []

    def test_subquery_invalid_model(self):
        with patch("plugin_auth.data_policy.services.get_loaded_models", return_value={"fake_model": FakeModel}):
            errors = validate_policy_semantics(
                rule={"type": "subquery", "field": "id", "model": "missing_model", "target_field": "id"},
                target_model="fake_model",
            )
        assert any("missing_model" in e for e in errors)
