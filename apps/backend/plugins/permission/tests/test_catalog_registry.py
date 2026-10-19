"""权限码目录构建、校验与展开测试。"""

import pytest
from plugin_permission.catalog.registry import (
    CatalogError,
    PermissionCatalog,
    build_catalog,
    get_catalog,
    set_catalog,
)
from rapidkit_framework.plugin import PermissionCodeDef, PluginManifest, ResourceDef


def _manifest(name: str, resources=(), codes=()) -> PluginManifest:
    return PluginManifest(name=name, version="0.1.0", resources=list(resources), permission_codes=list(codes))


def _code(code: str, *depends: str, action: str = "read") -> PermissionCodeDef:
    return PermissionCodeDef(code=code, label=code, abac_action=action, depends=depends)  # ty: ignore[invalid-argument-type]


def _basic() -> list[PluginManifest]:
    return [
        _manifest(
            "items",
            resources=[ResourceDef(key="item", label="条目"), ResourceDef(key="tag", label="标签")],
            codes=[
                _code("tag:read"),
                _code("item:read", "tag:read"),
                _code("item:update", "item:read", action="write"),
            ],
        )
    ]


def test_build_catalog_collects_resources_and_codes():
    catalog = build_catalog(_basic(), {"GET:/api/v1/items": "item:read"})
    assert set(catalog.resources) == {"item", "tag"}
    entry = catalog.codes["item:update"]
    assert (entry.resource, entry.abac_action, entry.depends, entry.source) == (
        "item",
        "write",
        ("item:read",),
        "code",
    )


def test_expand_follows_depends_transitively_and_ignores_unknown():
    catalog = build_catalog(_basic(), {})
    assert catalog.expand(["item:update", "ghost:read"]) == {"item:update", "item:read", "tag:read"}
    assert catalog.expand([]) == set()


def test_codes_for_route_and_bound_codes():
    catalog = build_catalog(_basic(), {"GET:/api/v1/items": "item:read"})
    assert catalog.codes_for_route("GET:/api/v1/items") == {"item:read"}
    assert catalog.codes_for_route("GET:/api/v1/other") == set()
    assert catalog.bound_codes() == {"item:read"}


def test_resource_of_returns_definition_and_rejects_unknown():
    catalog = build_catalog(_basic(), {})
    assert catalog.resource_of("item:read").key == "item"
    with pytest.raises(CatalogError, match="Unknown permission code"):
        catalog.resource_of("ghost:read")


def test_digest_is_stable_and_changes_with_content():
    first = build_catalog(_basic(), {"GET:/api/v1/items": "item:read"}).digest()
    second = build_catalog(_basic(), {"GET:/api/v1/items": "item:read"}).digest()
    third = build_catalog(_basic(), {"GET:/api/v1/items": "item:update"}).digest()
    assert first == second
    assert first != third


@pytest.mark.parametrize(
    ("manifests", "bindings", "message"),
    [
        ([_manifest("a", resources=[ResourceDef(key="Bad_Key", label="x")])], {}, "Invalid resource key"),
        (
            [
                _manifest("a", resources=[ResourceDef(key="item", label="x")]),
                _manifest("b", resources=[ResourceDef(key="item", label="y")]),
            ],
            {},
            "Duplicate resource 'item'",
        ),
        (
            [_manifest("a", resources=[ResourceDef(key="item", label="x")], codes=[_code("item-read")])],
            {},
            "Invalid permission code",
        ),
        ([_manifest("a", codes=[_code("ghost:read")])], {}, "unknown resource 'ghost'"),
        (
            [
                _manifest(
                    "a", resources=[ResourceDef(key="item", label="x")], codes=[_code("item:read"), _code("item:read")]
                )
            ],
            {},
            "Duplicate permission code 'item:read'",
        ),
        (
            [
                _manifest(
                    "a", resources=[ResourceDef(key="item", label="x")], codes=[_code("item:read", action="delete")]
                )
            ],
            {},
            "Invalid abac_action 'delete'",
        ),
        (
            [_manifest("a", resources=[ResourceDef(key="item", label="x")], codes=[_code("item:read", "item:ghost")])],
            {},
            "depends on unknown code 'item:ghost'",
        ),
        (
            [
                _manifest(
                    "a",
                    resources=[ResourceDef(key="item", label="x")],
                    codes=[_code("item:a", "item:b"), _code("item:b", "item:a")],
                )
            ],
            {},
            "dependency cycle: item:a -> item:b -> item:a",
        ),
        (
            [_manifest("a", resources=[ResourceDef(key="item", label="x")], codes=[_code("item:read")])],
            {"GET:/api/v1/items": "item:ghost"},
            "requires unknown permission code 'item:ghost'",
        ),
    ],
)
def test_build_catalog_rejects_invalid_declarations(manifests, bindings, message):
    with pytest.raises(CatalogError, match=message):
        build_catalog(manifests, bindings)


def test_get_catalog_requires_initialization():
    set_catalog(None)
    with pytest.raises(RuntimeError, match="Permission catalog has not been built"):
        get_catalog()
    catalog = build_catalog(_basic(), {})
    set_catalog(catalog)
    try:
        assert isinstance(get_catalog(), PermissionCatalog)
    finally:
        set_catalog(None)
