"""Unit tests for FieldPermissionFilter and serialization helpers."""

import os

os.environ.setdefault("RAPIDKIT_ENV", "test")

from dataclasses import dataclass
from uuid import UUID, uuid4

import pytest


@dataclass
class FakeFieldPolicy:
    id: UUID
    name: str
    target_model: str
    fields: list[str]
    actions: list[str]
    effect: str
    condition: dict | None = None
    status: int = 1


class TestBuildFieldRestrictions:
    def test_strip_effect_on_read(self):
        from plugin_permission.field_guard.services import FieldRestrictions, build_field_restrictions

        policies = [
            FakeFieldPolicy(id=uuid4(), name="p1", target_model="users", fields=["salary"], actions=["read"], effect="strip"),
        ]
        result = build_field_restrictions(policies, action="read", model_tablename="users")
        assert "salary" in result.stripped
        assert "salary" not in result.masked
        assert "salary" not in result.denied

    def test_mask_effect_on_read(self):
        from plugin_permission.field_guard.services import FieldRestrictions, build_field_restrictions

        policies = [
            FakeFieldPolicy(id=uuid4(), name="p1", target_model="users", fields=["phone"], actions=["read"], effect="mask"),
        ]
        result = build_field_restrictions(policies, action="read", model_tablename="users")
        assert "phone" in result.masked
        assert "phone" not in result.stripped

    def test_deny_effect_on_write(self):
        from plugin_permission.field_guard.services import FieldRestrictions, build_field_restrictions

        policies = [
            FakeFieldPolicy(id=uuid4(), name="p1", target_model="users", fields=["salary"], actions=["write"], effect="deny"),
        ]
        result = build_field_restrictions(policies, action="write", model_tablename="users")
        assert "salary" in result.denied

    def test_action_filtering(self):
        from plugin_permission.field_guard.services import build_field_restrictions

        policies = [
            FakeFieldPolicy(id=uuid4(), name="p1", target_model="users", fields=["phone"], actions=["write"], effect="deny"),
        ]
        # read action should not match write-only policy
        result = build_field_restrictions(policies, action="read", model_tablename="users")
        assert result.is_empty

    def test_no_policies_returns_empty(self):
        from plugin_permission.field_guard.services import build_field_restrictions

        result = build_field_restrictions([], action="read", model_tablename="users")
        assert result.is_empty

    def test_model_tablename_filtering(self):
        from plugin_permission.field_guard.services import build_field_restrictions

        policies = [
            FakeFieldPolicy(id=uuid4(), name="p1", target_model="items", fields=["price"], actions=["read"], effect="strip"),
        ]
        result = build_field_restrictions(policies, action="read", model_tablename="users")
        assert result.is_empty


class TestSerializeWithRestrictions:
    def test_strip_removes_field(self):
        from plugin_permission.field_guard.services import FieldRestrictions, serialize_with_restrictions

        data = {"name": "Alice", "salary": 50000, "phone": "13800001111"}
        restrictions = FieldRestrictions(stripped=["salary"], masked=[], denied=[])
        result = serialize_with_restrictions(data, restrictions)
        assert "salary" not in result
        assert result["name"] == "Alice"

    def test_mask_replaces_value(self):
        from plugin_permission.field_guard.services import FieldRestrictions, serialize_with_restrictions

        data = {"name": "Alice", "phone": "13812345678"}
        restrictions = FieldRestrictions(stripped=[], masked=["phone"], denied=[])
        result = serialize_with_restrictions(data, restrictions)
        assert result["phone"] == "138****5678"

    def test_no_restrictions_returns_unchanged(self):
        from plugin_permission.field_guard.services import FieldRestrictions, serialize_with_restrictions

        data = {"name": "Alice", "salary": 50000}
        restrictions = FieldRestrictions(stripped=[], masked=[], denied=[])
        result = serialize_with_restrictions(data, restrictions)
        assert result == data


class TestApplyFieldWriteRestrictions:
    def test_strip_silently_removes_field(self):
        from plugin_permission.field_guard.services import FieldRestrictions, apply_field_write_restrictions

        data = {"name": "Alice", "salary": 50000}
        restrictions = FieldRestrictions(stripped=["salary"], masked=[], denied=[])
        result = apply_field_write_restrictions(data, restrictions)
        assert "salary" not in result
        assert result["name"] == "Alice"

    def test_deny_raises_when_field_present(self):
        from plugin_permission.field_guard.services import FieldRestrictions, apply_field_write_restrictions
        from rapidkit_framework.exceptions import AppException

        data = {"name": "Alice", "salary": 50000}
        restrictions = FieldRestrictions(stripped=[], masked=[], denied=["salary"])
        with pytest.raises(AppException):
            apply_field_write_restrictions(data, restrictions)

    def test_deny_passes_when_field_absent(self):
        from plugin_permission.field_guard.services import FieldRestrictions, apply_field_write_restrictions

        data = {"name": "Alice"}
        restrictions = FieldRestrictions(stripped=[], masked=[], denied=["salary"])
        result = apply_field_write_restrictions(data, restrictions)
        assert result == {"name": "Alice"}

    def test_mask_removes_field_on_write(self):
        from plugin_permission.field_guard.services import FieldRestrictions, apply_field_write_restrictions

        data = {"name": "Alice", "phone": "13812345678"}
        restrictions = FieldRestrictions(stripped=[], masked=["phone"], denied=[])
        result = apply_field_write_restrictions(data, restrictions)
        assert "phone" not in result
