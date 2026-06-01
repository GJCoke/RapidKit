"""Unit tests for FieldPolicy model."""

import os

os.environ.setdefault("RAPIDKIT_ENV", "test")

import pytest


class TestFieldPolicyModel:
    def test_create_field_policy(self):
        from plugin_permission.field_guard.models import FieldPolicy

        policy = FieldPolicy(
            name="mask_phone",
            target_model="users",
            fields=["phone"],
            actions=["read"],
            effect="mask",
        )
        assert policy.name == "mask_phone"
        assert policy.fields == ["phone"]
        assert policy.actions == ["read"]
        assert policy.effect == "mask"

    def test_field_policy_defaults(self):
        from plugin_permission.field_guard.models import FieldPolicy

        policy = FieldPolicy(
            name="test",
            target_model="users",
            fields=["salary"],
            actions=["write"],
            effect="deny",
        )
        assert policy.description == ""
        assert policy.condition is None


class TestRoleFieldPolicyIds:
    def test_role_has_field_policy_ids(self):
        from plugin_permission.models import Role

        role = Role(
            name="Test Role",
            code="test_role_field",
            field_policy_ids=["00000000-0000-0000-0000-000000000001"],
        )
        assert role.field_policy_ids == ["00000000-0000-0000-0000-000000000001"]


class TestCachedPermissionsFieldPolicies:
    def test_has_field_policy_ids(self):
        from uuid import uuid4

        from plugin_permission.cache import CachedPermissions

        fp_id = uuid4()
        cached = CachedPermissions(field_policy_ids=[fp_id])
        assert cached.field_policy_ids == [fp_id]
