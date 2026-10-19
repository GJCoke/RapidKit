"""功能包纯函数：内置同步计划、授权合并与差异。"""

from uuid import uuid4

from plugin_permission.package.rules import (
    BuiltinPackage,
    ExistingPackage,
    Grant,
    ScopeChange,
    diff_grants,
    find_unknown_codes,
    merge_grants,
    plan_builtin_sync,
)


def _builtin(key: str, codes: tuple[str, ...] = ("user:read",)) -> BuiltinPackage:
    return BuiltinPackage(key=key, label=key, description="", codes=codes)


def _existing(key: str, *, builtin: bool = True, codes: tuple[str, ...] = ("user:read",)) -> ExistingPackage:
    return ExistingPackage(id=uuid4(), key=key, builtin=builtin, label=key, description="", codes=codes)


def test_find_unknown_codes_keeps_order_and_dedupes():
    assert find_unknown_codes(["a:b", "x:y", "a:b", "z:w"], {"a:b"}) == ["x:y", "z:w"]


def test_plan_creates_updates_and_deletes_builtin_only():
    custom = _existing("custom.mine", builtin=False)
    stale = _existing("gone.full")
    changed = _existing("user.full", codes=("user:read",))
    same = _existing("user.readonly")
    plan = plan_builtin_sync(
        [_builtin("user.readonly"), _builtin("user.full", ("user:read", "user:update")), _builtin("role.readonly")],
        [custom, stale, changed, same],
    )
    assert [item.key for item in plan.create] == ["role.readonly"]
    assert [(row_id, item.key) for row_id, item in plan.update] == [(changed.id, "user.full")]
    assert plan.delete == [stale.id]


def test_merge_keeps_current_and_overrides_scopes_per_resource():
    current = Grant(codes=("role:read",), data_scopes={"user": "self", "dept": "dept"},
                    field_modes={"user": {"contact": "hidden"}})
    package = Grant(codes=("user:read",), data_scopes={"user": "dept_subtree"},
                    field_modes={"user": {"remark": "hidden"}})
    merged = merge_grants(current, [package], "merge")
    assert merged.codes == ("role:read", "user:read")
    assert merged.data_scopes == {"user": "dept_subtree", "dept": "dept"}
    assert merged.field_modes == {"user": {"contact": "hidden", "remark": "hidden"}}


def test_replace_keeps_only_package_grants():
    current = Grant(codes=("role:read",), data_scopes={"user": "self"}, field_modes={"user": {"contact": "hidden"}})
    package = Grant(codes=("user:read",), data_scopes={}, field_modes={})
    replaced = merge_grants(current, [package], "replace")
    assert replaced == Grant(codes=("user:read",), data_scopes={}, field_modes={})


def test_diff_reports_codes_and_scope_changes():
    before = Grant(codes=("role:read",), data_scopes={"user": "self"}, field_modes={"user": {"contact": "hidden"}})
    after = Grant(codes=("user:read",), data_scopes={"dept": "dept"}, field_modes={"user": {"contact": "masked"}})
    diff = diff_grants(before, after)
    assert diff.added_codes == ["user:read"]
    assert diff.removed_codes == ["role:read"]
    assert diff.scope_changes == [
        ScopeChange(resource="user", group=None, before="self", after="all"),
        ScopeChange(resource="dept", group=None, before="all", after="dept"),
        ScopeChange(resource="user", group="contact", before="hidden", after="masked"),
    ]


def test_explicit_package_defaults_clear_only_selected_restrictions():
    current = Grant(
        codes=("item:read",),
        data_scopes={"item": "self", "department": "dept"},
        field_modes={"item": {"contact": "hidden", "note": "hidden"}},
    )
    package = Grant(codes=(), data_scopes={"item": "all"}, field_modes={"item": {"contact": "visible"}})
    result = merge_grants(current, [package], "merge")
    assert result.data_scopes == {"department": "dept"}
    assert result.field_modes == {"item": {"note": "hidden"}}


async def test_package_validation_preserves_explicit_default_overrides():
    from plugin_permission.catalog.registry import get_catalog, set_catalog
    from plugin_permission.package.services import validate_package_content
    from plugins.permission.tests.catalog_fixtures import make_scoped_catalog

    try:
        previous = get_catalog()
    except RuntimeError:
        previous = None
    set_catalog(make_scoped_catalog())
    try:
        assert await validate_package_content(
            ["item:read"], {"item": "all"}, {"item": {"contact": "visible"}}
        ) == ({"item": "all"}, {"item": {"contact": "visible"}})
    finally:
        set_catalog(previous)
