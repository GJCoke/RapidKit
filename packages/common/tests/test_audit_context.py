from uuid import uuid4

import pytest
from pydantic import ValidationError
from rapidkit_common.audit import AuditChange, AuditMetadata, AuditRecord


def test_record_preserves_verified_identity_and_subject_snapshot():
    actor, subject = uuid4(), uuid4()
    record = AuditRecord(
        action="user.update",
        actor_id=actor,
        subject_user_id=subject,
        impersonation_session_id=uuid4(),
        actor_type="user",
        result="failure",
        metadata=AuditMetadata(subject_name="Target", reason="Support"),
    )
    assert record.actor_id == actor
    assert record.subject_user_id == subject
    assert record.metadata.subject_name == "Target"
    assert record.id.version == 7


def test_record_rejects_negative_duration():
    with pytest.raises(ValidationError):
        AuditRecord(action="user.update", result="success", duration_ms=-1)


def test_sensitive_change_never_retains_old_or_new_secret():
    change = AuditChange(
        field="password", before="old", after="new", before_display="old", after_display="new", redacted=True
    )
    assert change.before is None and change.after is None
    assert change.before_display is None and change.after_display is None


def test_metadata_rejects_uncontrolled_payload():
    with pytest.raises(ValidationError):
        AuditMetadata(access_token="secret")
