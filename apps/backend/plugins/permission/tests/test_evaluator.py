"""Unit tests for create-operation in-memory policy evaluation."""

import os

os.environ.setdefault("RAPIDKIT_ENV", "test")

from dataclasses import dataclass
from uuid import UUID, uuid4

import pytest


@dataclass
class FakePolicy:
    id: UUID
    name: str
    target_model: str
    rule: dict
    effect: str
    actions: list[str]
    status: int = 1


@dataclass
class FakeUser:
    id: UUID
    is_admin: bool
    roles: list[str]
    department_id: UUID | None = None


class TestEvaluateCreatePermission:
    def test_allow_policy_matching_attributes_passes(self):
        from plugin_permission.data_policy.evaluator import evaluate_create_permission

        dept_id = uuid4()
        user = FakeUser(id=uuid4(), is_admin=False, roles=["editor"], department_id=dept_id)
        policy = FakePolicy(
            id=uuid4(),
            name="dept_filter",
            target_model="items",
            rule={"type": "condition", "field": "department_id", "operator": "eq", "value": "${user.dept_id}"},
            effect="allow",
            actions=["write"],
        )
        obj_attrs = {"department_id": str(dept_id)}
        # Should not raise
        evaluate_create_permission(obj_attrs, [policy], user)

    def test_allow_policy_non_matching_attributes_raises(self):
        from plugin_permission.data_policy.evaluator import evaluate_create_permission
        from plugin_permission.status_codes import RbacStatusCode
        from rapidkit_framework.exceptions import AppException

        user = FakeUser(id=uuid4(), is_admin=False, roles=["editor"], department_id=uuid4())
        policy = FakePolicy(
            id=uuid4(),
            name="dept_filter",
            target_model="items",
            rule={"type": "condition", "field": "department_id", "operator": "eq", "value": "${user.dept_id}"},
            effect="allow",
            actions=["write"],
        )
        other_dept = uuid4()
        obj_attrs = {"department_id": str(other_dept)}
        with pytest.raises(AppException) as exc_info:
            evaluate_create_permission(obj_attrs, [policy], user)
        assert exc_info.value.code == RbacStatusCode.CREATE_PERMISSION_DENIED.code

    def test_deny_policy_matching_attributes_raises(self):
        from plugin_permission.data_policy.evaluator import evaluate_create_permission
        from plugin_permission.status_codes import RbacStatusCode
        from rapidkit_framework.exceptions import AppException

        user = FakeUser(id=uuid4(), is_admin=False, roles=["editor"], department_id=uuid4())
        policy = FakePolicy(
            id=uuid4(),
            name="deny_dept3",
            target_model="items",
            rule={"type": "condition", "field": "department_id", "operator": "eq", "value": "dept-3"},
            effect="deny",
            actions=["write"],
        )
        obj_attrs = {"department_id": "dept-3"}
        with pytest.raises(AppException) as exc_info:
            evaluate_create_permission(obj_attrs, [policy], user)
        assert exc_info.value.code == RbacStatusCode.CREATE_PERMISSION_DENIED.code

    def test_deny_policy_non_matching_passes(self):
        from plugin_permission.data_policy.evaluator import evaluate_create_permission

        user = FakeUser(id=uuid4(), is_admin=False, roles=["editor"], department_id=uuid4())
        policy = FakePolicy(
            id=uuid4(),
            name="deny_dept3",
            target_model="items",
            rule={"type": "condition", "field": "department_id", "operator": "eq", "value": "dept-3"},
            effect="deny",
            actions=["write"],
        )
        obj_attrs = {"department_id": "dept-1"}
        # Should not raise
        evaluate_create_permission(obj_attrs, [policy], user)

    def test_no_policies_allows_all(self):
        from plugin_permission.data_policy.evaluator import evaluate_create_permission

        user = FakeUser(id=uuid4(), is_admin=False, roles=["editor"])
        obj_attrs = {"name": "anything"}
        # Should not raise
        evaluate_create_permission(obj_attrs, [], user)

    def test_group_and_condition(self):
        from plugin_permission.data_policy.evaluator import evaluate_create_permission

        dept_id = uuid4()
        user = FakeUser(id=uuid4(), is_admin=False, roles=["editor"], department_id=dept_id)
        policy = FakePolicy(
            id=uuid4(),
            name="group_policy",
            target_model="items",
            rule={
                "type": "group",
                "logic": "AND",
                "conditions": [
                    {"type": "condition", "field": "department_id", "operator": "eq", "value": "${user.dept_id}"},
                    {"type": "condition", "field": "status", "operator": "eq", "value": "active"},
                ],
            },
            effect="allow",
            actions=["write"],
        )
        # Both conditions match
        obj_attrs = {"department_id": str(dept_id), "status": "active"}
        evaluate_create_permission(obj_attrs, [policy], user)

    def test_group_and_condition_partial_match_raises(self):
        from plugin_permission.data_policy.evaluator import evaluate_create_permission
        from rapidkit_framework.exceptions import AppException

        dept_id = uuid4()
        user = FakeUser(id=uuid4(), is_admin=False, roles=["editor"], department_id=dept_id)
        policy = FakePolicy(
            id=uuid4(),
            name="group_policy",
            target_model="items",
            rule={
                "type": "group",
                "logic": "AND",
                "conditions": [
                    {"type": "condition", "field": "department_id", "operator": "eq", "value": "${user.dept_id}"},
                    {"type": "condition", "field": "status", "operator": "eq", "value": "active"},
                ],
            },
            effect="allow",
            actions=["write"],
        )
        # Only dept matches, status doesn't
        obj_attrs = {"department_id": str(dept_id), "status": "inactive"}
        with pytest.raises(AppException):
            evaluate_create_permission(obj_attrs, [policy], user)

    def test_read_only_policies_are_ignored(self):
        from plugin_permission.data_policy.evaluator import evaluate_create_permission

        user = FakeUser(id=uuid4(), is_admin=False, roles=["editor"])
        policy = FakePolicy(
            id=uuid4(),
            name="read_only",
            target_model="items",
            rule={"type": "condition", "field": "x", "operator": "eq", "value": "nope"},
            effect="allow",
            actions=["read"],  # read-only, should be ignored for create
        )
        obj_attrs = {"x": "anything"}
        # Should not raise because no write policies apply
        evaluate_create_permission(obj_attrs, [policy], user)
