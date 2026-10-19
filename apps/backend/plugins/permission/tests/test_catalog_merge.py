"""build_catalog 合并扩展测试。"""

from rapidkit_framework.plugin import PermissionCodeDef, PluginManifest, ResourceDef

from plugin_permission.catalog.extensions import CatalogExtension
from plugin_permission.catalog.registry import build_catalog


def _manifests() -> list[PluginManifest]:
    return [
        PluginManifest(
            name="demo",
            version="0.1.0",
            resources=[ResourceDef(key="user", label="用户"), ResourceDef(key="position", label="岗位")],
            permission_codes=[
                PermissionCodeDef(code="user:read", label="查看用户", abac_action="read"),
                PermissionCodeDef(code="user:update", label="编辑用户", abac_action="write", depends=("user:read",)),
                PermissionCodeDef(code="position:read", label="查看岗位", abac_action="read"),
            ],
        )
    ]


BINDINGS = {"GET:/api/v1/users": "user:read", "GET:/api/v1/positions/all": "position:read"}


def test_without_extensions_has_empty_extension_fields():
    catalog = build_catalog(_manifests(), BINDINGS)
    assert catalog.extra_route_codes == {}
    assert catalog.extension_states == ()


def test_active_extensions_are_merged():
    catalog = build_catalog(
        _manifests(),
        BINDINGS,
        [
            CatalogExtension(kind="custom_code", code="user:audit", resource="user", label="审计", abac_action="read"),
            CatalogExtension(kind="depends", code="user:update", depends_on="position:read"),
            CatalogExtension(kind="route_binding", code="user:audit", route_key="GET:/api/v1/users"),
        ],
    )
    assert catalog.codes["user:audit"].source == "extension"
    assert catalog.codes["user:audit"].label == "审计"
    assert catalog.codes["user:update"].depends == ("user:read", "position:read")
    assert catalog.expand({"user:update"}) == {"user:update", "user:read", "position:read"}
    assert catalog.codes_for_route("GET:/api/v1/users") == {"user:read", "user:audit"}
    assert [s.status for s in catalog.extension_states] == ["active", "active", "active"]


def test_invalid_extension_does_not_raise_and_is_excluded():
    catalog = build_catalog(
        _manifests(),
        BINDINGS,
        [CatalogExtension(kind="route_binding", code="ghost:read", route_key="GET:/api/v1/users")],
    )
    assert catalog.codes_for_route("GET:/api/v1/users") == {"user:read"}
    assert catalog.extension_states[0].status == "invalid"


def test_allows_uses_declared_code_and_extension_bindings():
    catalog = build_catalog(
        _manifests(),
        BINDINGS,
        [
            CatalogExtension(kind="custom_code", code="user:audit", resource="user", label="审计", abac_action="read"),
            CatalogExtension(kind="route_binding", code="user:audit", route_key="GET:/api/v1/users"),
        ],
    )
    assert catalog.allows("user:read", "GET:/api/v1/users", {"user:read"})
    assert catalog.allows("user:read", "GET:/api/v1/users", {"user:audit"})
    assert not catalog.allows("user:read", "GET:/api/v1/users", {"position:read"})
    # 路由不在绑定表中（例如测试替身路由）时退回到声明码
    assert catalog.allows("position:read", "GET:/api/v1/unknown", {"position:read"})


def test_digest_changes_with_extensions():
    base = build_catalog(_manifests(), BINDINGS)
    extended = build_catalog(
        _manifests(),
        BINDINGS,
        [CatalogExtension(kind="route_binding", code="user:read", route_key="GET:/api/v1/positions/all")],
    )
    assert base.digest() != extended.digest()
    assert base.digest() == build_catalog(_manifests(), BINDINGS).digest()
