from datetime import datetime, timedelta
from uuid import uuid4

from plugin_auth.impersonation.models import EndReason, ImpersonationSession
from plugin_auth.impersonation.schemas import ImpersonationCreated, ImpersonationCurrent, UserSummary
from plugin_system.models import AuditLog, AuditResult, AuditSource
from plugin_system.schemas import AuditLogDetail, AuditLogListItem
from rapidkit_core.timezone import timezone


def test_columns_and_indexes():
    table = ImpersonationSession.__table__
    assert {
        "actor_id",
        "subject_user_id",
        "expires_at",
        "ended_at",
        "end_reason",
        "created_at",
        "id",
        "created_by",
        "create_time",
        "update_time",
    } <= set(table.columns.keys())
    index = next(i for i in table.indexes if i.name == "uq_auth_impersonation_active_actor")
    assert index.unique and str(index.dialect_options["postgresql"]["where"]) == "ended_at IS NULL"
    assert not table.foreign_keys
    assert {v.value for v in EndReason} == {"stopped", "expired", "replaced", "actor_revoked", "subject_revoked"}
    for name in ("subject_user_id", "impersonation_session_id"):
        assert AuditLog.__table__.columns[name].nullable
        assert any(name in i.columns.keys() for i in AuditLog.__table__.indexes)


def test_response_contract():
    user = UserSummary(id=uuid4(), name="测试", username="tester")
    now = timezone.now()
    created = ImpersonationCreated(
        access_token="test", session_id=uuid4(), subject=user, expires_at=now + timedelta(hours=1)
    )
    data = created.model_dump(mode="json", by_alias=True)
    assert set(data) == {"accessToken", "sessionId", "subject", "expiresAt"}
    assert datetime.fromisoformat(data["expiresAt"]).tzinfo is not None
    current = ImpersonationCurrent(
        session_id=created.session_id, actor=user, subject=user, created_at=now, expires_at=created.expires_at
    )
    assert datetime.fromisoformat(current.model_dump(mode="json", by_alias=True)["createdAt"]).tzinfo is not None


def test_audit_snapshot_projection():
    record = AuditLog(
        actor_id=uuid4(),
        subject_user_id=uuid4(),
        impersonation_session_id=uuid4(),
        action="test",
        result=AuditResult.SUCCESS,
        source=AuditSource.HTTP,
        extra_data={"subject_name": "Deleted user", "subject_username": "deleted"},
    )
    item = AuditLogListItem.model_validate(record).model_dump(by_alias=True)
    assert item["subjectName"] == "Deleted user"
    assert item["subjectUserId"] == record.subject_user_id
    detail = AuditLogDetail.model_validate(record)
    assert detail.metadata == record.extra_data
    assert detail.subject_username == "deleted"
