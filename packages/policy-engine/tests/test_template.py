"""Tests for template variable resolution."""

from datetime import UTC, date, datetime
from uuid import uuid4

from rapidkit_policy_engine.template import TemplateContext, resolve_template_value


class FakeUser:
    def __init__(self):
        self.id = uuid4()
        self.is_admin = False
        self.roles = ["admin", "user"]
        self.department_id = uuid4()


def test_resolve_literal_value():
    ctx = TemplateContext(user=FakeUser(), now=datetime.now(tz=UTC))
    assert resolve_template_value("hello", ctx) == "hello"


def test_resolve_user_id():
    ctx = TemplateContext(user=FakeUser(), now=datetime.now(tz=UTC))
    result = resolve_template_value("${user.id}", ctx)
    assert result == str(ctx.user.id)


def test_resolve_user_roles():
    ctx = TemplateContext(user=FakeUser(), now=datetime.now(tz=UTC))
    result = resolve_template_value("${user.roles}", ctx)
    assert result == ["admin", "user"]


def test_resolve_now_returns_datetime():
    ctx = TemplateContext(user=FakeUser(), now=datetime.now(tz=UTC))
    result = resolve_template_value("${now}", ctx)
    assert isinstance(result, datetime)


def test_resolve_today_returns_date():
    ctx = TemplateContext(user=FakeUser(), now=datetime.now(tz=UTC))
    result = resolve_template_value("${today}", ctx)
    assert isinstance(result, date)


def test_resolve_unknown_var_returns_none():
    ctx = TemplateContext(user=FakeUser(), now=datetime.now(tz=UTC))
    result = resolve_template_value("${unknown.var}", ctx)
    assert result is None
