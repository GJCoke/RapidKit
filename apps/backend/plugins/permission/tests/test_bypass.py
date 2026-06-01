"""Unit tests for permission bypass utility."""

import os

os.environ.setdefault("RAPIDKIT_ENV", "test")

from dataclasses import dataclass
from uuid import UUID

import pytest


@dataclass
class FakeUser:
    id: UUID
    is_admin: bool
    roles: list[str]
    department_id: UUID | None = None


class TestIsPermissionBypass:
    def test_admin_user_bypasses(self):
        from plugin_permission.bypass import is_permission_bypass

        user = FakeUser(id=UUID("00000000-0000-0000-0000-000000000001"), is_admin=True, roles=[])
        assert is_permission_bypass(user) is True

    def test_non_admin_user_does_not_bypass(self):
        from plugin_permission.bypass import is_permission_bypass

        user = FakeUser(id=UUID("00000000-0000-0000-0000-000000000002"), is_admin=False, roles=["user"])
        assert is_permission_bypass(user) is False
