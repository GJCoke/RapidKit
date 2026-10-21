import pytest
from plugin_system.audit_catalog import build_audit_catalog
from rapidkit_framework.audit import AuditActionDef
from rapidkit_framework.plugin import PluginManifest


def test_catalog_rejects_duplicate_actions_and_conflicting_resource_labels():
    action = AuditActionDef("user.update", "user.audit.update", "user", "user.audit.resource")
    with pytest.raises(ValueError, match="Duplicate"):
        build_audit_catalog(
            [PluginManifest("one", "1", audit_actions=[action]), PluginManifest("two", "1", audit_actions=[action])]
        )
