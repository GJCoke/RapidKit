"""Dashboard capability aggregation services."""

import hashlib
import json
from collections.abc import Iterable, Mapping, Set

from rapidkit_framework.plugin import DashboardModuleDef, PluginManifest

from plugin_permission.catalog.registry import PermissionCatalog
from plugin_permission.dashboard.schemas import DashboardCapabilitiesResponse


def collect_dashboard_modules(manifests: Iterable[PluginManifest]) -> list[DashboardModuleDef]:
    """Collect module definitions contributed by loaded plugins."""
    return [definition for manifest in manifests for definition in manifest.dashboard_modules]


def find_unknown_dashboard_codes(manifests: Iterable[PluginManifest], catalog: PermissionCatalog) -> list[str]:
    """返回首页模块声明中不在目录里的权限码（去重、排序）。"""
    declared = {code for definition in collect_dashboard_modules(manifests) for code in definition.required_permissions}
    return sorted(declared - set(catalog.codes))


def resolve_capabilities(
    definitions: Iterable[DashboardModuleDef],
    codes: Set[str],
    *,
    is_admin: bool,
    role_versions: Mapping[str, int],
) -> DashboardCapabilitiesResponse:
    """Resolve authorized modules; ``codes`` 为用户已展开的权限码。"""
    by_key: dict[str, DashboardModuleDef] = {}
    for definition in definitions:
        if definition.key in by_key:
            raise ValueError(f"duplicate dashboard module key: {definition.key}")
        by_key[definition.key] = definition

    allowed_modules = [
        key
        for key, definition in sorted(by_key.items())
        if is_admin or set(definition.required_permissions).issubset(codes)
    ]
    revision_payload = {
        "allowedModules": allowed_modules,
        "roleVersions": sorted(role_versions.items()),
    }
    revision = hashlib.sha256(
        json.dumps(revision_payload, separators=(",", ":"), ensure_ascii=True).encode()
    ).hexdigest()

    return DashboardCapabilitiesResponse(allowed_modules=allowed_modules, revision=revision)
