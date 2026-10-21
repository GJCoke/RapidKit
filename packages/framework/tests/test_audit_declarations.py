import pytest

from rapidkit_framework.audit import AuditActionDef, AuditResult
from rapidkit_framework.plugin import PluginManifest


def test_manifest_carries_explicit_business_actions():
    action = AuditActionDef(
        "notification.publish", "notification.audit.publish", "notification", "notification.audit.resource"
    )
    manifest = PluginManifest(name="notification", version="1", audit_actions=[action])
    assert manifest.audit_actions[0].code == "notification.publish"
    assert AuditResult.UNKNOWN == "unknown"


@pytest.mark.parametrize("code", ["publish", "users/create", "user.", "User.create"])
def test_action_rejects_ambiguous_codes(code):
    with pytest.raises(ValueError):
        AuditActionDef(code, "audit.action", "user", "audit.resource")
