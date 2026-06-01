"""Unit tests for policy template variable resolution."""

from datetime import UTC, date, datetime
from unittest.mock import MagicMock
from uuid import UUID

import pytest
from rapidkit_policy_engine import TemplateContext, resolve_template_value
from rapidkit_policy_engine.template_registry import (
    _template_resolvers,
    get_registered_var_names,
    register_template_var,
    unregister_template_var,
)


@pytest.fixture
def mock_user():
    user = MagicMock()
    user.id = UUID("00000000-0000-0000-0000-000000000001")
    user.department_id = UUID("00000000-0000-0000-0000-000000000010")
    user.roles = ["ADMIN", "GUEST"]
    return user


@pytest.fixture
def mock_user_no_dept():
    user = MagicMock()
    user.id = UUID("00000000-0000-0000-0000-000000000002")
    user.department_id = None
    user.roles = ["GUEST"]
    return user


class TestResolveTemplateValue:
    def test_user_id(self, mock_user):
        ctx = TemplateContext(user=mock_user, now=datetime.now(tz=UTC))
        result = resolve_template_value("${user.id}", ctx)
        assert result == "00000000-0000-0000-0000-000000000001"

    def test_user_dept_id(self, mock_user):
        ctx = TemplateContext(user=mock_user, now=datetime.now(tz=UTC))
        result = resolve_template_value("${user.dept_id}", ctx)
        assert result == "00000000-0000-0000-0000-000000000010"

    def test_user_dept_id_none(self, mock_user_no_dept):
        ctx = TemplateContext(user=mock_user_no_dept, now=datetime.now(tz=UTC))
        result = resolve_template_value("${user.dept_id}", ctx)
        assert result is None

    def test_user_roles(self, mock_user):
        ctx = TemplateContext(user=mock_user, now=datetime.now(tz=UTC))
        result = resolve_template_value("${user.roles}", ctx)
        assert result == ["ADMIN", "GUEST"]

    def test_now(self, mock_user):
        ctx = TemplateContext(user=mock_user, now=datetime.now(tz=UTC))
        result = resolve_template_value("${now}", ctx)
        assert isinstance(result, datetime)

    def test_today(self, mock_user):
        ctx = TemplateContext(user=mock_user, now=datetime.now(tz=UTC))
        result = resolve_template_value("${today}", ctx)
        assert isinstance(result, date)

    def test_plain_string(self, mock_user):
        ctx = TemplateContext(user=mock_user, now=datetime.now(tz=UTC))
        result = resolve_template_value("active", ctx)
        assert result == "active"

    def test_unknown_variable(self, mock_user):
        ctx = TemplateContext(user=mock_user, now=datetime.now(tz=UTC))
        result = resolve_template_value("${unknown}", ctx)
        assert result is None

    def test_comma_separated_list(self, mock_user):
        ctx = TemplateContext(user=mock_user, now=datetime.now(tz=UTC))
        result = resolve_template_value("a,b,c", ctx)
        assert result == "a,b,c"


class TestTemplateRegistry:
    def setup_method(self):
        """Clean registry before each test."""
        _template_resolvers.clear()

    def test_register_and_resolve_custom_var(self, mock_user):
        register_template_var("user.org_id", lambda ctx: "org-123")
        ctx = TemplateContext(user=mock_user, now=datetime.now(tz=UTC))
        result = resolve_template_value("${user.org_id}", ctx)
        assert result == "org-123"

    def test_builtin_takes_priority_over_registry(self, mock_user):
        """Built-in user.id should not be overridden by registry."""
        register_template_var("user.id", lambda ctx: "overridden")
        ctx = TemplateContext(user=mock_user, now=datetime.now(tz=UTC))
        result = resolve_template_value("${user.id}", ctx)
        assert result == "00000000-0000-0000-0000-000000000001"

    def test_unregister_var(self, mock_user):
        register_template_var("user.custom", lambda ctx: "val")
        unregister_template_var("user.custom")
        ctx = TemplateContext(user=mock_user, now=datetime.now(tz=UTC))
        result = resolve_template_value("${user.custom}", ctx)
        assert result is None

    def test_get_registered_var_names(self):
        register_template_var("user.org_id", lambda ctx: "org")
        register_template_var("user.team", lambda ctx: "team")
        names = get_registered_var_names()
        assert "user.org_id" in names
        assert "user.team" in names

    def test_unregister_nonexistent_is_noop(self):
        unregister_template_var("nonexistent")  # Should not raise
