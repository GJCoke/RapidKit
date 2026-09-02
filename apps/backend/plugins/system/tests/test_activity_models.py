"""Persistence boundary tests for audit logs and dashboard activity."""

from plugin_system.models import ActivityEvent, AuditLog
from sqlalchemy import UniqueConstraint


def test_activity_and_audit_use_separate_tables():
    assert AuditLog.__tablename__ == "system_audit_logs"
    assert ActivityEvent.__tablename__ == "system_activity_events"


def test_activity_source_event_is_unique():
    constraints = ActivityEvent.__table__.constraints
    names = {constraint.name for constraint in constraints if isinstance(constraint, UniqueConstraint)}
    assert "uq_system_activity_source_event_id" in names


def test_activity_does_not_store_request_diagnostics():
    columns = set(ActivityEvent.__table__.columns.keys())
    assert columns.isdisjoint({"ip", "source_ip", "user_agent", "request_body", "request_summary", "token"})
