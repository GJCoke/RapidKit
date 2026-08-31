"""Dashboard capability aggregation services."""

import hashlib
import json
from collections.abc import Iterable, Mapping, Set

from rapidkit_framework.plugin import DashboardModuleDef, PluginManifest

from plugin_permission.dashboard.schemas import DashboardCapabilitiesResponse


def collect_dashboard_modules(manifests: Iterable[PluginManifest]) -> list[DashboardModuleDef]:
    """Collect module definitions contributed by loaded plugins."""
    return [definition for manifest in manifests for definition in manifest.dashboard_modules]


def resolve_capabilities(
    definitions: Iterable[DashboardModuleDef],
    permissions: Set[str],
    *,
    is_admin: bool,
    role_versions: Mapping[str, int],
) -> DashboardCapabilitiesResponse:
    """Resolve authorized module keys and a stable permission revision."""
    by_key: dict[str, DashboardModuleDef] = {}
    for definition in definitions:
        if definition.key in by_key:
            raise ValueError(f"duplicate dashboard module key: {definition.key}")
        by_key[definition.key] = definition

    allowed_modules = [
        key
        for key, definition in sorted(by_key.items())
        if is_admin or set(definition.required_permissions).issubset(permissions)
    ]
    revision_payload = {
        "allowedModules": allowed_modules,
        "roleVersions": sorted(role_versions.items()),
    }
    revision = hashlib.sha256(
        json.dumps(revision_payload, separators=(",", ":"), ensure_ascii=True).encode()
    ).hexdigest()

    return DashboardCapabilitiesResponse(allowed_modules=allowed_modules, revision=revision)
