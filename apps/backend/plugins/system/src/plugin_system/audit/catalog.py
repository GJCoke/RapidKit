"""Validated audit action directory assembled from loaded plugins."""

from rapidkit_framework.audit import AuditActionDef
from rapidkit_framework.plugin import PluginManifest


def build_audit_catalog(manifests: list[PluginManifest]) -> dict[str, AuditActionDef]:
    actions: dict[str, AuditActionDef] = {}
    resources: dict[str, str] = {}
    for manifest in manifests:
        for action in manifest.audit_actions:
            if action.code in actions:
                raise ValueError(f"Duplicate audit action: {action.code}")
            if action.resource_type in resources and resources[action.resource_type] != action.resource_label_key:
                raise ValueError(f"Conflicting audit resource: {action.resource_type}")
            resources[action.resource_type] = action.resource_label_key
            actions[action.code] = action
    return actions
