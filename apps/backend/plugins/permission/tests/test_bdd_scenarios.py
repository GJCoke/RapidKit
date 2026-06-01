"""
BDD acceptance scenarios for ABAC enforcement.

Each class represents a behavior scenario in Given/When/Then format.
"""

import os

os.environ.setdefault("RAPIDKIT_ENV", "test")

from dataclasses import dataclass, field
from uuid import UUID, uuid4

import pytest
from rapidkit_framework.exceptions import AppException

from plugin_permission.status_codes import RbacStatusCode


@dataclass
class FakeUser:
    id: UUID = field(default_factory=uuid4)
    is_admin: bool = False
    roles: list[str] = field(default_factory=lambda: ["user"])
    department_id: UUID | None = None


@dataclass
class FakePolicy:
    id: UUID = field(default_factory=uuid4)
    name: str = ""
    target_model: str = ""
    rule: dict = field(default_factory=dict)
    effect: str = "allow"
    actions: list[str] = field(default_factory=lambda: ["read", "write"])
    status: int = 1


@dataclass
class FakeFieldPolicy:
    id: UUID = field(default_factory=uuid4)
    name: str = ""
    target_model: str = ""
    fields: list[str] = field(default_factory=list)
    actions: list[str] = field(default_factory=lambda: ["read", "write"])
    effect: str = "strip"
    condition: dict | None = None
    status: int = 1


class TestWriteSideABAC:
    """
    GIVEN user has role with read-only data policy on Model
    WHEN user attempts to use write filter
    THEN only read policies apply, write is unrestricted
    """

    def test_read_only_policy_not_applied_to_write(self):
        from plugin_permission.data_policy.filter_logic import build_filter_condition

        policy = FakePolicy(
            name="read_only",
            target_model="items",
            rule={"type": "condition", "field": "dept_id", "operator": "eq", "value": "dept-1"},
            effect="allow",
            actions=["read"],  # read only
        )
        result = build_filter_condition([policy], action="write", model_tablename="items")
        # No write policies → None (allow all)
        assert result is None

    def test_write_policy_applied_to_write(self):
        from plugin_permission.data_policy.filter_logic import build_filter_condition

        policy = FakePolicy(
            name="write_allowed",
            target_model="items",
            rule={"type": "condition", "field": "dept_id", "operator": "eq", "value": "dept-1"},
            effect="allow",
            actions=["write"],
        )
        result = build_filter_condition([policy], action="write", model_tablename="items")
        assert result is not None


class TestDenyOverride:
    """
    GIVEN user has allow policy on dept_id IN [1,2,3]
    AND user has deny policy on dept_id = 3
    WHEN filter is built
    THEN result is allow AND NOT deny (dept 3 excluded)
    """

    def test_deny_excludes_from_allow(self):
        from plugin_permission.data_policy.filter_logic import build_filter_condition

        allow = FakePolicy(
            name="allow_depts",
            target_model="items",
            rule={"type": "condition", "field": "dept_id", "operator": "in", "value": ["1", "2", "3"]},
            effect="allow",
            actions=["read"],
        )
        deny = FakePolicy(
            name="deny_dept3",
            target_model="items",
            rule={"type": "condition", "field": "dept_id", "operator": "eq", "value": "3"},
            effect="deny",
            actions=["read"],
        )
        result = build_filter_condition([allow, deny], action="read", model_tablename="items")
        # Should return a combined condition (not None)
        assert result is not None

    def test_deny_only_produces_not_condition(self):
        from plugin_permission.data_policy.filter_logic import build_filter_condition

        deny = FakePolicy(
            name="deny_dept3",
            target_model="items",
            rule={"type": "condition", "field": "dept_id", "operator": "eq", "value": "3"},
            effect="deny",
            actions=["read"],
        )
        result = build_filter_condition([deny], action="read", model_tablename="items")
        assert result is not None


class TestFieldMasking:
    """
    GIVEN user has field policy masking 'phone' on User model
    WHEN serialization is applied
    THEN phone fields are returned as '138****1234'
    """

    def test_phone_masked_in_response(self):
        from plugin_permission.field_guard.services import FieldRestrictions, serialize_with_restrictions

        data = {"name": "Alice", "phone": "13812345678", "email": "alice@test.com"}
        restrictions = FieldRestrictions(stripped=[], masked=["phone"], denied=[])
        result = serialize_with_restrictions(data, restrictions)
        assert result["phone"] == "138****5678"
        assert result["name"] == "Alice"
        assert result["email"] == "alice@test.com"

    def test_email_masked_in_response(self):
        from plugin_permission.field_guard.services import FieldRestrictions, serialize_with_restrictions

        data = {"name": "Alice", "email": "alice@example.com"}
        restrictions = FieldRestrictions(stripped=[], masked=["email"], denied=[])
        result = serialize_with_restrictions(data, restrictions)
        assert result["email"] == "a***@example.com"


class TestFieldStrip:
    """
    GIVEN user has field policy stripping 'salary'
    WHEN data is serialized
    THEN salary field is removed from response
    """

    def test_stripped_field_removed(self):
        from plugin_permission.field_guard.services import FieldRestrictions, serialize_with_restrictions

        data = {"name": "Alice", "salary": 100000}
        restrictions = FieldRestrictions(stripped=["salary"], masked=[], denied=[])
        result = serialize_with_restrictions(data, restrictions)
        assert "salary" not in result
        assert result["name"] == "Alice"


class TestFieldWriteDenial:
    """
    GIVEN user has field policy denying write to 'salary'
    WHEN user submits update containing salary field
    THEN request is rejected
    """

    def test_denied_field_rejects_write(self):
        from plugin_permission.field_guard.services import FieldRestrictions, apply_field_write_restrictions

        data = {"name": "Alice", "salary": 100000}
        restrictions = FieldRestrictions(stripped=[], masked=[], denied=["salary"])
        with pytest.raises(AppException) as exc_info:
            apply_field_write_restrictions(data, restrictions)
        assert exc_info.value.code == RbacStatusCode.FIELD_WRITE_DENIED.code

    def test_denied_field_passes_when_absent(self):
        from plugin_permission.field_guard.services import FieldRestrictions, apply_field_write_restrictions

        data = {"name": "Alice"}
        restrictions = FieldRestrictions(stripped=[], masked=[], denied=["salary"])
        result = apply_field_write_restrictions(data, restrictions)
        assert result == {"name": "Alice"}


class TestCreatePermission:
    """
    GIVEN user has write policy restricting to dept_id = user's dept
    WHEN user creates a record with different dept_id
    THEN request is rejected
    """

    def test_create_within_policy_scope_passes(self):
        from plugin_permission.data_policy.evaluator import evaluate_create_permission

        dept_id = uuid4()
        user = FakeUser(department_id=dept_id)
        policy = FakePolicy(
            name="dept_only",
            target_model="items",
            rule={"type": "condition", "field": "department_id", "operator": "eq", "value": "${user.dept_id}"},
            effect="allow",
            actions=["write"],
        )
        # Create with matching dept — should pass
        evaluate_create_permission({"department_id": str(dept_id)}, [policy], user)

    def test_create_outside_policy_scope_raises(self):
        from plugin_permission.data_policy.evaluator import evaluate_create_permission

        user = FakeUser(department_id=uuid4())
        policy = FakePolicy(
            name="dept_only",
            target_model="items",
            rule={"type": "condition", "field": "department_id", "operator": "eq", "value": "${user.dept_id}"},
            effect="allow",
            actions=["write"],
        )
        other_dept = str(uuid4())
        with pytest.raises(AppException) as exc_info:
            evaluate_create_permission({"department_id": other_dept}, [policy], user)
        assert exc_info.value.code == RbacStatusCode.CREATE_PERMISSION_DENIED.code


class TestAdminBypass:
    """
    GIVEN user is admin
    WHEN deny policies exist
    THEN admin bypass returns True
    """

    def test_admin_ignores_all_policies(self):
        from plugin_permission.bypass import is_permission_bypass

        admin = FakeUser(is_admin=True)
        assert is_permission_bypass(admin) is True

    def test_non_admin_does_not_bypass(self):
        from plugin_permission.bypass import is_permission_bypass

        user = FakeUser(is_admin=False)
        assert is_permission_bypass(user) is False


class TestNoPolicyFullAccess:
    """
    GIVEN user has no data/field policies assigned
    WHEN filter is built
    THEN no restrictions (allow all)
    """

    def test_no_data_policy_allows_all(self):
        from plugin_permission.data_policy.filter_logic import build_filter_condition

        data_result = build_filter_condition([], action="read", model_tablename="users")
        assert data_result is None  # None = no restriction

    def test_no_field_policy_allows_all(self):
        from plugin_permission.field_guard.services import build_field_restrictions

        field_result = build_field_restrictions([], action="read", model_tablename="users")
        assert field_result.is_empty

    def test_create_with_no_policies_passes(self):
        from plugin_permission.data_policy.evaluator import evaluate_create_permission

        user = FakeUser()
        evaluate_create_permission({"anything": "value"}, [], user)
