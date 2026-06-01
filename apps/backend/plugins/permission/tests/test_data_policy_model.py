"""Unit tests for DataPolicy model extensions."""

import os

os.environ.setdefault("RAPIDKIT_ENV", "test")

import pytest


class TestDataPolicyModel:
    def test_has_effect_field(self):
        from plugin_permission.models import DataPolicy

        policy = DataPolicy(
            name="test",
            target_model="users",
            rule={},
            effect="deny",
            actions=["read"],
        )
        assert policy.effect == "deny"

    def test_has_actions_field(self):
        from plugin_permission.models import DataPolicy

        policy = DataPolicy(
            name="test",
            target_model="users",
            rule={},
            effect="allow",
            actions=["read", "write"],
        )
        assert policy.actions == ["read", "write"]

    def test_effect_defaults_to_allow(self):
        from plugin_permission.models import DataPolicy

        policy = DataPolicy(
            name="test",
            target_model="users",
            rule={},
            actions=["read", "write"],
        )
        assert policy.effect == "allow"

    def test_actions_defaults_to_read_write(self):
        from plugin_permission.models import DataPolicy

        policy = DataPolicy(
            name="test",
            target_model="users",
            rule={},
        )
        assert policy.actions == ["read", "write"]
