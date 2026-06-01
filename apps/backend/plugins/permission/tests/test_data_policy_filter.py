"""Unit tests for DataPermissionFilter with action support."""

import os

os.environ.setdefault("RAPIDKIT_ENV", "test")

import pytest
from sqlmodel import Field
from rapidkit_common.models import SQLModel


class TestDataPermissionFilterInit:
    def test_accepts_action_parameter(self):
        from plugin_permission.data_policy.deps import DataPermissionFilter

        class FakeModel(SQLModel, table=True):
            __tablename__ = "test_dpf_action_model"
            name: str = Field(default="test")

        f = DataPermissionFilter(FakeModel, action="write")
        assert f.action == "write"

    def test_defaults_to_read(self):
        from plugin_permission.data_policy.deps import DataPermissionFilter

        class FakeModel2(SQLModel, table=True):
            __tablename__ = "test_dpf_default_model"
            name: str = Field(default="test")

        f = DataPermissionFilter(FakeModel2)
        assert f.action == "read"
