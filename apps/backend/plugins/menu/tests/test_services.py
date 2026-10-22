"""Unit tests for menu service functions."""

from datetime import datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, call
from uuid import uuid4

import plugin_menu.route.services as route_services
import pytest
from plugin_menu.crud import MenuCRUD
from plugin_menu.models import Menu
from plugin_menu.route.services import build_route_tree, get_user_routes, menu_to_route, permitted_route_names
from plugin_menu.schemas import ActiveMenuOption, MenuCreate, MenuResponse, MenuUpdate
from plugin_menu.services import (
    create_menu,
    delete_menu,
    delete_menus,
    ensure_delete_preserves_active_menu_bindings,
    ensure_update_preserves_active_menu_bindings,
    filter_menu,
    normalize_menu_permission,
    get_active_menu_options,
    resolve_active_menu_id,
    update_menu,
)
from plugin_menu.status_codes import MenuStatusCode
from pydantic import ValidationError
from rapidkit_common.enums import MenuType, Status
from rapidkit_framework.exceptions import AppException


def make_menu(route_name: str, *, parent_id=None, **overrides) -> Menu:
    values = {
        "menu_name": route_name,
        "menu_type": MenuType.MENU,
        "route_name": route_name,
        "route_path": f"/{route_name}",
        "parent_id": parent_id,
        "status": Status.ON,
        "hide_in_menu": False,
        "permission": "user:read",
    }
    values.update(overrides)
    return Menu(**values)

@pytest.fixture(autouse=True)
def catalog_reader(monkeypatch: pytest.MonkeyPatch):
    reader = SimpleNamespace(has_code=lambda code: code in {"user:read", "role:read"})
    monkeypatch.setattr("plugin_menu.services.get_service", lambda _protocol: reader)
    return reader

def test_menu_model_stores_nullable_active_menu_id():
    target_id = uuid4()
    menu = Menu(
        menu_name="Detail",
        route_name="user_detail",
        route_path="/user/detail",
        active_menu_id=target_id,
    )
    assert menu.active_menu_id == target_id


def test_menu_create_accepts_active_menu_route_name():
    data = MenuCreate.model_validate(
        {
            "menuName": "Detail",
            "menuType": "2",
            "routeName": "user_detail",
            "routePath": "/user/detail",
            "hideInMenu": True,
            "activeMenu": "manage_user",
        }
    )
    assert data.active_menu == "manage_user"


def test_menu_update_is_partial_and_distinguishes_omitted_from_explicit_null():
    omitted = MenuUpdate.model_validate({"menuName": "Renamed"})
    cleared = MenuUpdate.model_validate({"activeMenu": None})

    assert omitted.menu_name == "Renamed"
    assert omitted.route_name is None
    assert "active_menu" not in omitted.model_fields_set
    assert "active_menu" in cleared.model_fields_set


@pytest.mark.parametrize(
    "field",
    [
        "menuName",
        "menuType",
        "order",
        "routeName",
        "routePath",
        "iconType",
        "status",
        "hideInMenu",
        "keepAlive",
        "constant",
        "multiTab",
        "query",
    ],
)
def test_menu_update_rejects_explicit_null_for_non_nullable_fields(field):
    with pytest.raises(ValidationError):
        MenuUpdate.model_validate({field: None})


@pytest.mark.parametrize("field", ["activeMenu", "parentId", "component", "icon", "i18nKey", "href", "fixedIndexInTab", "permission"])
def test_menu_update_accepts_explicit_null_for_nullable_fields(field):
    data = MenuUpdate.model_validate({field: None})
    assert data.model_fields_set


def test_menu_update_json_schema_marks_optional_stored_fields_non_nullable():
    schema = MenuUpdate.model_json_schema(by_alias=True)

    assert "required" not in schema
    assert schema["properties"]["menuName"]["type"] == "string"
    assert schema["properties"]["constant"]["type"] == "boolean"


def test_menu_update_json_schema_keeps_nullable_fields_nullable():
    schema = MenuUpdate.model_json_schema(by_alias=True)

    active_types = {item["type"] for item in schema["properties"]["activeMenu"]["anyOf"]}
    parent_types = {item["type"] for item in schema["properties"]["parentId"]["anyOf"]}
    assert active_types == {"string", "null"}
    assert parent_types == {"string", "null"}


def test_menu_response_serializes_active_menu_and_option_aliases():
    response = MenuResponse.model_validate(
        {
            "id": uuid4(),
            "menu_name": "Detail",
            "menu_type": "2",
            "route_name": "user_detail",
            "route_path": "/user/detail",
            "active_menu": "manage_user",
            "create_time": datetime.now(),
            "update_time": datetime.now(),
        }
    )
    option = ActiveMenuOption(id=uuid4(), route_name="manage_user", menu_name="Users")
    assert response.model_dump(by_alias=True)["activeMenu"] == "manage_user"
    assert option.model_dump(by_alias=True)["routeName"] == "manage_user"


@pytest.mark.asyncio
async def test_resolve_active_menu_allows_missing_optional_value():
    crud = AsyncMock()
    assert await resolve_active_menu_id(crud, None, None, None, MenuType.MENU, True, False) is None


@pytest.mark.asyncio
async def test_resolve_active_menu_accepts_enabled_visible_ancestor():
    root = make_menu("root")
    child_parent = make_menu("users", parent_id=root.id)
    crud = AsyncMock()
    crud.get_by_route_name.return_value = root
    crud.get_parent_map.return_value = {root.id: None, child_parent.id: root.id}
    crud.get_constant_map.return_value = {root.id: False, child_parent.id: False}

    result = await resolve_active_menu_id(crud, "root", None, child_parent.id, MenuType.MENU, True, False)

    assert result == root.id


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("menu_type", "hide_in_menu", "parent_id"),
    [
        (MenuType.DIRECTORY, True, uuid4()),
        (MenuType.MENU, False, uuid4()),
        (MenuType.MENU, True, None),
    ],
)
async def test_resolve_active_menu_rejects_invalid_source(menu_type, hide_in_menu, parent_id):
    with pytest.raises(AppException):
        await resolve_active_menu_id(AsyncMock(), "target", None, parent_id, menu_type, hide_in_menu, False)


@pytest.mark.asyncio
async def test_resolve_active_menu_rejects_non_ancestor():
    target = make_menu("other")
    parent = make_menu("users")
    crud = AsyncMock()
    crud.get_by_route_name.return_value = target
    crud.get_parent_map.return_value = {target.id: None, parent.id: None}

    with pytest.raises(AppException):
        await resolve_active_menu_id(crud, "other", None, parent.id, MenuType.MENU, True, False)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "target_overrides",
    [
        {"menu_type": MenuType.DIRECTORY},
        {"hide_in_menu": True},
        {"status": Status.OFF},
    ],
)
async def test_resolve_active_menu_rejects_unavailable_target(target_overrides):
    target = make_menu("target", **target_overrides)
    child_parent = make_menu("parent", parent_id=target.id)
    crud = AsyncMock()
    crud.get_by_route_name.return_value = target

    with pytest.raises(AppException):
        await resolve_active_menu_id(crud, "target", None, child_parent.id, MenuType.MENU, True, False)


@pytest.mark.asyncio
async def test_resolve_active_menu_rejects_unknown_target():
    crud = AsyncMock()
    crud.get_by_route_name.return_value = None

    with pytest.raises(AppException):
        await resolve_active_menu_id(crud, "missing", None, uuid4(), MenuType.MENU, True, False)


@pytest.mark.asyncio
async def test_resolve_active_menu_rejects_self_target_on_update():
    target = make_menu("target")
    crud = AsyncMock()
    crud.get_by_route_name.return_value = target

    with pytest.raises(AppException):
        await resolve_active_menu_id(crud, "target", target.id, uuid4(), MenuType.MENU, True, False)


@pytest.mark.asyncio
async def test_resolve_active_menu_rejects_cross_constant_partition():
    target = make_menu("target", constant=True)
    parent = make_menu("parent", parent_id=target.id, constant=True)
    crud = AsyncMock()
    crud.get_by_route_name.return_value = target

    with pytest.raises(AppException) as exc_info:
        await resolve_active_menu_id(crud, "target", None, parent.id, MenuType.MENU, True, False)

    assert exc_info.value.code == MenuStatusCode.ACTIVE_MENU_TARGET_UNAVAILABLE.code


@pytest.mark.asyncio
async def test_create_rejects_binding_across_cross_partition_intermediate():
    target = make_menu("target", constant=False)
    intermediate = make_menu("intermediate", parent_id=target.id, constant=True)
    crud = AsyncMock()
    crud.get_by_route_name.return_value = target
    crud.get_parent_map.return_value = {target.id: None, intermediate.id: target.id}
    crud.get_constant_map.return_value = {target.id: False, intermediate.id: True}
    data = MenuCreate(
        menu_name="child",
        menu_type=MenuType.MENU,
        route_name="child",
        route_path="/child",
        parent_id=intermediate.id,
        hide_in_menu=True,
        active_menu=target.route_name,
        constant=False,
    )

    with pytest.raises(AppException) as exc_info:
        await create_menu(crud, data)

    assert exc_info.value.code == MenuStatusCode.ACTIVE_MENU_TARGET_UNAVAILABLE.code


@pytest.mark.asyncio
async def test_update_protection_rejects_hiding_referenced_target():
    target = make_menu("target")
    referencing_child = make_menu("child", parent_id=target.id, active_menu_id=target.id, hide_in_menu=True)
    crud = AsyncMock()
    crud.get_active_menu_references.return_value = [referencing_child]

    with pytest.raises(AppException) as exc_info:
        await ensure_update_preserves_active_menu_bindings(
            crud,
            target,
            parent_id=target.parent_id,
            menu_type=target.menu_type,
            status=target.status,
            hide_in_menu=True,
            active_menu_id=target.active_menu_id,
        )
    assert exc_info.value.code == MenuStatusCode.REFERENCED_TARGET_CONFLICT.code


@pytest.mark.asyncio
async def test_update_protection_rejects_moving_hidden_child_outside_target_ancestry():
    target = make_menu("target")
    child = make_menu("child", parent_id=target.id, active_menu_id=target.id, hide_in_menu=True)
    other_parent = make_menu("other")
    crud = AsyncMock()
    crud.get_active_menu_references.return_value = []
    crud.get_parent_map.return_value = {target.id: None, child.id: target.id, other_parent.id: None}
    crud.get_all_active_menu_bindings.return_value = [child]

    with pytest.raises(AppException) as exc_info:
        await ensure_update_preserves_active_menu_bindings(
            crud,
            child,
            parent_id=other_parent.id,
            menu_type=child.menu_type,
            status=child.status,
            hide_in_menu=child.hide_in_menu,
            active_menu_id=child.active_menu_id,
        )
    assert exc_info.value.code == MenuStatusCode.MOVE_INVALIDATES_BINDING.code


@pytest.mark.asyncio
async def test_delete_protection_rejects_referenced_target():
    crud = AsyncMock()
    crud.get_active_menu_references.return_value = [make_menu("child", hide_in_menu=True)]

    with pytest.raises(AppException) as exc_info:
        await ensure_delete_preserves_active_menu_bindings(crud, [uuid4()])
    assert exc_info.value.code == MenuStatusCode.REFERENCED_TARGET_CONFLICT.code


@pytest.mark.asyncio
async def test_delete_protection_rejects_removing_intermediate_ancestor():
    target = make_menu("target")
    intermediate = make_menu("intermediate", parent_id=target.id, menu_type=MenuType.DIRECTORY)
    child = make_menu("child", parent_id=intermediate.id, active_menu_id=target.id, hide_in_menu=True)
    crud = AsyncMock()
    crud.get_parent_map.return_value = {
        target.id: None,
        intermediate.id: target.id,
        child.id: intermediate.id,
    }
    crud.get_all_active_menu_bindings.return_value = [child]

    with pytest.raises(AppException) as exc_info:
        await ensure_delete_preserves_active_menu_bindings(crud, [intermediate.id])

    assert exc_info.value.code == MenuStatusCode.REFERENCED_TARGET_CONFLICT.code


@pytest.mark.asyncio
async def test_active_menu_options_include_only_eligible_ancestors_nearest_first():
    root = make_menu("root")
    directory = make_menu("directory", parent_id=root.id, menu_type=MenuType.DIRECTORY)
    parent = make_menu("parent", parent_id=directory.id)
    crud = AsyncMock()
    crud.get_all.return_value = [root, directory, parent]

    options = await get_active_menu_options(crud, parent.id, False)

    assert [option.route_name for option in options] == ["parent", "root"]


@pytest.mark.asyncio
async def test_active_menu_options_stop_at_cross_partition_intermediate():
    root = make_menu("root", constant=False)
    intermediate = make_menu("intermediate", parent_id=root.id, constant=True)
    parent = make_menu("parent", parent_id=intermediate.id, constant=False)
    crud = AsyncMock()
    crud.get_all.return_value = [root, intermediate, parent]

    options = await get_active_menu_options(crud, parent.id, False)

    assert [option.route_name for option in options] == ["parent"]


@pytest.mark.asyncio
async def test_create_visible_menu_normalizes_active_menu_to_null():
    data = MenuCreate(permission="user:read",
        menu_name="visible",
        menu_type=MenuType.MENU,
        route_name="visible",
        route_path="/visible",
        hide_in_menu=False,
        active_menu="ancestor",
    )
    created = make_menu("visible")
    crud = AsyncMock()
    crud.create.return_value = created
    crud.get_route_name_map.return_value = {created.id: created.route_name}

    response = await create_menu(crud, data)

    assert crud.create.call_args.args[0]["active_menu_id"] is None
    assert response.active_menu is None


def test_active_menu_conflict_status_codes_are_distinct():
    assert MenuStatusCode.REFERENCED_TARGET_CONFLICT.code == 63001
    assert MenuStatusCode.MOVE_INVALIDATES_BINDING.code == 63002


@pytest.mark.asyncio
async def test_update_protection_allows_moving_hidden_child_with_explicit_clear():
    target = make_menu("target")
    child = make_menu("child", parent_id=target.id, active_menu_id=target.id, hide_in_menu=True)
    other_parent = make_menu("other")
    crud = AsyncMock()
    crud.get_active_menu_references.return_value = []
    crud.get_parent_map.return_value = {target.id: None, child.id: target.id, other_parent.id: None}
    crud.get_all_active_menu_bindings.return_value = [child]

    await ensure_update_preserves_active_menu_bindings(
        crud,
        child,
        parent_id=other_parent.id,
        menu_type=child.menu_type,
        status=child.status,
        hide_in_menu=child.hide_in_menu,
        active_menu_id=None,
    )


@pytest.mark.asyncio
async def test_update_protection_allows_move_with_valid_rebinding():
    old_target = make_menu("old-target")
    new_target = make_menu("new-target")
    child = make_menu("child", parent_id=old_target.id, active_menu_id=old_target.id, hide_in_menu=True)
    new_parent = make_menu("new-parent", parent_id=new_target.id)
    crud = AsyncMock()
    crud.get_active_menu_references.return_value = []
    crud.get_parent_map.return_value = {
        old_target.id: None,
        new_target.id: None,
        child.id: old_target.id,
        new_parent.id: new_target.id,
    }
    crud.get_constant_map.return_value = {
        old_target.id: False,
        new_target.id: False,
        child.id: False,
        new_parent.id: False,
    }
    crud.get_all_active_menu_bindings.return_value = [child]

    await ensure_update_preserves_active_menu_bindings(
        crud,
        child,
        parent_id=new_parent.id,
        menu_type=child.menu_type,
        status=child.status,
        hide_in_menu=child.hide_in_menu,
        active_menu_id=new_target.id,
    )


@pytest.mark.asyncio
async def test_update_protection_allows_hidden_to_visible_binding_clear():
    target = make_menu("target")
    child = make_menu("child", parent_id=target.id, active_menu_id=target.id, hide_in_menu=True)
    crud = AsyncMock()
    crud.get_active_menu_references.return_value = []

    await ensure_update_preserves_active_menu_bindings(
        crud,
        child,
        parent_id=child.parent_id,
        menu_type=child.menu_type,
        status=child.status,
        hide_in_menu=False,
        active_menu_id=None,
    )


@pytest.mark.asyncio
async def test_update_protection_rejects_moving_intermediate_node_that_breaks_binding():
    target = make_menu("target")
    intermediate = make_menu("intermediate", parent_id=target.id, menu_type=MenuType.DIRECTORY)
    child = make_menu("child", parent_id=intermediate.id, active_menu_id=target.id, hide_in_menu=True)
    other_parent = make_menu("other")
    crud = AsyncMock()
    crud.get_active_menu_references.return_value = []
    crud.get_parent_map.return_value = {
        target.id: None,
        intermediate.id: target.id,
        child.id: intermediate.id,
        other_parent.id: None,
    }
    crud.get_all_active_menu_bindings.return_value = [child]

    with pytest.raises(AppException) as exc_info:
        await ensure_update_preserves_active_menu_bindings(
            crud,
            intermediate,
            parent_id=other_parent.id,
            menu_type=intermediate.menu_type,
            status=intermediate.status,
            hide_in_menu=intermediate.hide_in_menu,
            active_menu_id=intermediate.active_menu_id,
        )

    assert exc_info.value.code == MenuStatusCode.MOVE_INVALIDATES_BINDING.code


@pytest.mark.asyncio
async def test_update_menu_applies_explicit_clear_before_validating_atomic_move():
    target = make_menu("target")
    child = make_menu("child", parent_id=target.id, active_menu_id=target.id, hide_in_menu=True)
    other_parent = make_menu("other")
    updated = make_menu("child", parent_id=other_parent.id, active_menu_id=None, hide_in_menu=True)
    data = MenuUpdate(
        menu_name=child.menu_name,
        menu_type=child.menu_type,
        route_name=child.route_name,
        route_path=child.route_path,
        parent_id=other_parent.id,
        hide_in_menu=True,
        active_menu=None,
    )
    crud = AsyncMock()
    crud.get.return_value = child
    crud.get_active_menu_references.return_value = []
    crud.get_parent_map.return_value = {target.id: None, child.id: target.id, other_parent.id: None}
    crud.get_all_active_menu_bindings.return_value = [child]
    crud.update_by_id.return_value = updated
    crud.get_route_name_map.return_value = {updated.id: updated.route_name}

    response = await update_menu(crud, child.id, data)

    assert crud.update_by_id.call_args.args[1]["active_menu_id"] is None
    assert response.active_menu is None


@pytest.mark.asyncio
async def test_partial_update_preserves_omitted_fields_and_active_menu_binding():
    target = make_menu("target")
    current = make_menu("child", parent_id=target.id, active_menu_id=target.id, hide_in_menu=True)
    updated = make_menu(
        "child",
        parent_id=target.id,
        active_menu_id=target.id,
        hide_in_menu=True,
        menu_name="Renamed",
    )
    crud = AsyncMock()
    crud.get.return_value = current
    crud.get_active_menu_references.return_value = []
    crud.update_by_id.return_value = updated
    crud.get_route_name_map.return_value = {target.id: target.route_name, updated.id: updated.route_name}

    response = await update_menu(crud, current.id, MenuUpdate(menu_name="Renamed"))

    values = crud.update_by_id.call_args.args[1]
    assert values["menu_name"] == "Renamed"
    assert values["active_menu_id"] == target.id
    assert "route_name" not in values
    assert response.active_menu == target.route_name


@pytest.mark.asyncio
async def test_update_rejects_changing_constant_partition_of_referenced_target():
    target = make_menu("target", constant=False)
    child = make_menu("child", parent_id=target.id, active_menu_id=target.id, hide_in_menu=True, constant=False)
    crud = AsyncMock()
    crud.get.return_value = target
    crud.get_active_menu_references.return_value = [child]

    with pytest.raises(AppException) as exc_info:
        await update_menu(crud, target.id, MenuUpdate(constant=True))

    assert exc_info.value.code == MenuStatusCode.REFERENCED_TARGET_CONFLICT.code


@pytest.mark.asyncio
async def test_update_rejects_changing_constant_partition_of_bound_source():
    target = make_menu("target", constant=False)
    child = make_menu("child", parent_id=target.id, active_menu_id=target.id, hide_in_menu=True, constant=False)
    crud = AsyncMock()
    crud.get.side_effect = [child, target]

    with pytest.raises(AppException) as exc_info:
        await update_menu(crud, child.id, MenuUpdate(constant=True))

    assert exc_info.value.code == MenuStatusCode.ACTIVE_MENU_TARGET_UNAVAILABLE.code


@pytest.mark.asyncio
async def test_update_rejects_cross_partition_intermediate_change():
    target = make_menu("target", constant=False)
    intermediate = make_menu("intermediate", parent_id=target.id, menu_type=MenuType.DIRECTORY, constant=False)
    child = make_menu(
        "child",
        parent_id=intermediate.id,
        active_menu_id=target.id,
        hide_in_menu=True,
        constant=False,
    )
    crud = AsyncMock()
    crud.get.return_value = intermediate
    crud.get_active_menu_references.return_value = []
    crud.get_parent_map.return_value = {
        target.id: None,
        intermediate.id: target.id,
        child.id: intermediate.id,
    }
    crud.get_constant_map.return_value = {
        target.id: False,
        intermediate.id: False,
        child.id: False,
    }
    crud.get_all_active_menu_bindings.return_value = [child]

    with pytest.raises(AppException) as exc_info:
        await update_menu(crud, intermediate.id, MenuUpdate(constant=True))

    assert exc_info.value.code == MenuStatusCode.REFERENCED_TARGET_CONFLICT.code


@pytest.mark.asyncio
async def test_admin_route_mapping_uses_one_menu_query_for_active_menu_names():
    target = make_menu("target")
    child = make_menu("child", parent_id=target.id, active_menu_id=target.id, hide_in_menu=True)
    query_result = MagicMock()
    query_result.all.return_value = [target, child]
    session = AsyncMock()
    session.exec.return_value = query_result
    admin = SimpleNamespace(is_admin=True, roles=[])

    routes = await get_user_routes(admin, session)

    assert session.exec.await_count == 1
    assert routes.routes[0].children[0].meta.active_menu == target.route_name


def test_permitted_route_names_use_page_permission_codes():
    directory = make_menu("dir", menu_type=MenuType.DIRECTORY, permission=None)
    page = make_menu("page", parent_id=directory.id, permission="page:read")
    other = make_menu("other", permission="other:read")

    assert permitted_route_names([directory, page, other], {"page:read"}) == {"page"}


@pytest.mark.asyncio
async def test_active_menu_binding_does_not_grant_hidden_route_permission(monkeypatch: pytest.MonkeyPatch):
    target = make_menu("target", permission="target:read")
    hidden_child = make_menu(
        "hidden-child", parent_id=target.id, active_menu_id=target.id, hide_in_menu=True, permission="child:read"
    )
    query_result = MagicMock()
    query_result.all.return_value = [target, hidden_child]
    session = AsyncMock()
    session.exec.return_value = query_result
    permission_cache = AsyncMock()
    permission_cache.get_role_codes.return_value = {"target:read"}
    monkeypatch.setattr(route_services, "get_service", lambda _: permission_cache)

    routes = await get_user_routes(SimpleNamespace(is_admin=False, roles=["viewer"]), session)

    assert [route.name for route in routes.routes] == [target.route_name]
    assert routes.routes[0].children is None


@pytest.mark.asyncio
async def test_permitted_hidden_child_is_excluded_when_active_target_is_not_permitted(
    monkeypatch: pytest.MonkeyPatch,
):
    target = make_menu("target", permission="target:read")
    hidden_child = make_menu(
        "hidden-child", parent_id=target.id, active_menu_id=target.id, hide_in_menu=True, permission="child:read"
    )
    query_result = MagicMock()
    query_result.all.return_value = [target, hidden_child]
    session = AsyncMock()
    session.exec.return_value = query_result
    permission_cache = AsyncMock()
    permission_cache.get_role_codes.return_value = {"child:read"}
    monkeypatch.setattr(route_services, "get_service", lambda _: permission_cache)

    routes = await get_user_routes(SimpleNamespace(is_admin=False, roles=["viewer"]), session)

    assert routes.routes == []


@pytest.mark.asyncio
async def test_permitted_hidden_child_is_included_when_active_target_is_also_permitted(
    monkeypatch: pytest.MonkeyPatch,
):
    target = make_menu("target", permission="target:read")
    hidden_child = make_menu(
        "hidden-child", parent_id=target.id, active_menu_id=target.id, hide_in_menu=True, permission="child:read"
    )
    query_result = MagicMock()
    query_result.all.return_value = [target, hidden_child]
    session = AsyncMock()
    session.exec.return_value = query_result
    permission_cache = AsyncMock()
    permission_cache.get_role_codes.return_value = {"target:read", "child:read"}
    monkeypatch.setattr(route_services, "get_service", lambda _: permission_cache)

    routes = await get_user_routes(SimpleNamespace(is_admin=False, roles=["viewer"]), session)

    assert routes.routes[0].name == target.route_name
    assert routes.routes[0].children[0].name == hidden_child.route_name
    assert routes.routes[0].children[0].meta.active_menu == target.route_name


@pytest.mark.asyncio
@pytest.mark.parametrize("permit_intermediate", [False, True])
async def test_hidden_child_requires_every_page_ancestor_permission(
    monkeypatch: pytest.MonkeyPatch,
    permit_intermediate: bool,
):
    target = make_menu("target", permission="target:read")
    intermediate = make_menu("intermediate", parent_id=target.id, permission="intermediate:read")
    child = make_menu(
        "child", parent_id=intermediate.id, active_menu_id=target.id, hide_in_menu=True, permission="child:read"
    )
    query_result = MagicMock()
    query_result.all.return_value = [target, intermediate, child]
    session = AsyncMock()
    session.exec.return_value = query_result
    codes = {"target:read", "child:read"}
    if permit_intermediate:
        codes.add("intermediate:read")
    permission_cache = AsyncMock()
    permission_cache.get_role_codes.return_value = codes
    monkeypatch.setattr(route_services, "get_service", lambda _: permission_cache)

    routes = await get_user_routes(SimpleNamespace(is_admin=False, roles=["viewer"]), session)

    if permit_intermediate:
        assert routes.routes[0].children[0].children[0].name == child.route_name
    else:
        assert all(route.name != child.route_name for route in routes.routes)
        assert routes.routes[0].children is None


@pytest.mark.asyncio
async def test_directory_is_visible_only_with_a_visible_child(monkeypatch: pytest.MonkeyPatch):
    directory = make_menu("dir", menu_type=MenuType.DIRECTORY, permission=None)
    page = make_menu("page", parent_id=directory.id, permission="page:read")
    empty = make_menu("empty", menu_type=MenuType.DIRECTORY, permission=None)
    query_result = MagicMock()
    query_result.all.return_value = [directory, page, empty]
    session = AsyncMock()
    session.exec.return_value = query_result
    permission_cache = AsyncMock()
    permission_cache.get_role_codes.return_value = {"page:read"}
    monkeypatch.setattr(route_services, "get_service", lambda _: permission_cache)

    routes = await get_user_routes(SimpleNamespace(is_admin=False, roles=["viewer"]), session)

    assert [route.name for route in routes.routes] == ["dir"]
    assert routes.routes[0].children[0].name == "page"

@pytest.mark.asyncio
async def test_user_route_cache_separates_admin_and_non_admin_with_same_roles(monkeypatch: pytest.MonkeyPatch):
    from plugin_menu.route.schemas import UserRouteResponse
    from plugin_menu.services import get_cached_user_routes

    redis = AsyncMock()
    redis.get.return_value = None
    redis.mget.return_value = ["1"]
    redis.lock = MagicMock(return_value=MagicMock(acquire=AsyncMock(return_value=True), release=AsyncMock()))
    route_builder = AsyncMock(return_value=UserRouteResponse(routes=[], home="home"))
    monkeypatch.setattr("plugin_menu.services.get_user_routes", route_builder)
    permission_cache = AsyncMock()
    permission_cache.get_catalog_version.return_value = 1
    monkeypatch.setattr("plugin_menu.services.get_service", lambda _: permission_cache)
    session = AsyncMock()
    roles = ["shared-role"]

    await get_cached_user_routes(SimpleNamespace(is_admin=True, roles=roles), redis, session)
    await get_cached_user_routes(SimpleNamespace(is_admin=False, roles=roles), redis, session)

    keys = list(dict.fromkeys(call.args[0] for call in redis.get.await_args_list))
    assert len(keys) == 2


@pytest.mark.asyncio
async def test_user_route_cache_role_hash_has_no_delimiter_collision(monkeypatch: pytest.MonkeyPatch):
    from plugin_menu.route.schemas import UserRouteResponse
    from plugin_menu.services import get_cached_user_routes

    redis = AsyncMock()
    redis.get.return_value = None
    redis.mget.return_value = ["1"]
    redis.lock = MagicMock(return_value=MagicMock(acquire=AsyncMock(return_value=True), release=AsyncMock()))
    monkeypatch.setattr(
        "plugin_menu.services.get_user_routes",
        AsyncMock(return_value=UserRouteResponse(routes=[], home="home")),
    )
    permission_cache = AsyncMock()
    permission_cache.get_catalog_version.return_value = 1
    monkeypatch.setattr("plugin_menu.services.get_service", lambda _: permission_cache)
    session = AsyncMock()

    await get_cached_user_routes(SimpleNamespace(is_admin=False, roles=["a:b", "c"]), redis, session)
    await get_cached_user_routes(SimpleNamespace(is_admin=False, roles=["a", "b:c"]), redis, session)

    keys = list(dict.fromkeys(call.args[0] for call in redis.get.await_args_list))
    assert len(keys) == 2


@pytest.mark.asyncio
@pytest.mark.parametrize("operation", ["create", "update", "delete", "batch_delete"])
async def test_semantic_menu_mutations_lock_tree_before_validation(operation):
    target = make_menu("target")
    crud = AsyncMock()
    crud.get.return_value = target
    crud.create.return_value = target
    crud.update_by_id.return_value = target
    crud.get_route_name_map.return_value = {target.id: target.route_name}
    crud.get_active_menu_references.return_value = []
    crud.get_parent_map.return_value = {target.id: None}
    crud.get_all_active_menu_bindings.return_value = []

    if operation == "create":
        await create_menu(crud, MenuCreate(menu_name="new", route_name="new", route_path="/new"))
    elif operation == "update":
        await update_menu(crud, target.id, MenuUpdate(menu_name="renamed"))
    elif operation == "delete":
        await delete_menu(crud, target.id)
    else:
        await delete_menus(crud, [target.id])

    crud.lock_menu_tree.assert_awaited_once_with()
    assert crud.mock_calls[0] == call.lock_menu_tree()


@pytest.mark.asyncio
async def test_lock_menu_tree_uses_for_update_sql():
    session = AsyncMock()
    query_result = MagicMock()
    query_result.all.return_value = []
    session.exec.return_value = query_result

    await MenuCRUD(session).lock_menu_tree()

    statement = session.exec.await_args.args[0]
    assert "FOR UPDATE" in str(statement)


def test_constant_route_tree_keeps_active_menu_name_within_partition():
    target = make_menu("target", constant=True)
    child = make_menu(
        "child",
        parent_id=target.id,
        active_menu_id=target.id,
        hide_in_menu=True,
        constant=True,
    )

    routes = build_route_tree([target, child])

    assert routes[0].children[0].meta.active_menu == target.route_name


class TestFilterMenu:
    def test_no_filters_still_has_parent_id_null(self):
        result = filter_menu(status=None, keyword="")
        # Always includes parent_id IS NULL
        assert len(result) == 1

    def test_status_filter(self):
        from rapidkit_common.enums import Status

        result = filter_menu(status=Status.ON, keyword="")
        assert len(result) == 2  # parent_id IS NULL + status

    def test_keyword_filter(self):
        result = filter_menu(status=None, keyword="dashboard")
        assert len(result) == 2  # parent_id IS NULL + keyword OR

    def test_keyword_escapes_wildcards(self):
        result = filter_menu(status=None, keyword="100%")
        assert len(result) == 2


class TestMenuToRoute:
    def _make_menu(self, **overrides):
        menu = MagicMock()
        menu.id = overrides.get("id", uuid4())
        menu.menu_name = overrides.get("menu_name", "Dashboard")
        menu.i18n_key = overrides.get("i18n_key", "route.dashboard")
        menu.icon = overrides.get("icon", "mdi:home")
        menu.icon_type = overrides.get("icon_type", None)
        menu.order = overrides.get("order", 1)
        menu.constant = overrides.get("constant", False)
        menu.hide_in_menu = overrides.get("hide_in_menu", False)
        menu.active_menu_id = overrides.get("active_menu_id", None)
        menu.keep_alive = overrides.get("keep_alive", True)
        menu.href = overrides.get("href", None)
        menu.multi_tab = overrides.get("multi_tab", False)
        menu.fixed_index_in_tab = overrides.get("fixed_index_in_tab", None)
        menu.query = overrides.get("query", None)
        menu.route_name = overrides.get("route_name", "dashboard")
        menu.route_path = overrides.get("route_path", "/dashboard")
        menu.component = overrides.get("component", "layout.base$view.dashboard")
        return menu

    def test_basic_conversion(self):
        menu = self._make_menu()

        route = menu_to_route(menu, {})

        assert route.name == "dashboard"
        assert route.path == "/dashboard"
        assert route.meta.title == "Dashboard"
        assert route.meta.icon == "mdi:home"
        assert route.meta.local_icon is None

    def test_local_icon(self):
        from rapidkit_common.enums import MenuIconType

        menu = self._make_menu(icon="custom-icon", icon_type=MenuIconType.LOCAL)

        route = menu_to_route(menu, {})

        assert route.meta.icon is None
        assert route.meta.local_icon == "custom-icon"

    def test_no_icon(self):
        menu = self._make_menu(icon=None)

        route = menu_to_route(menu, {})

        assert route.meta.icon is None
        assert route.meta.local_icon is None

    def test_menu_to_route_resolves_active_menu_route_name(self):
        target_id = uuid4()
        menu = self._make_menu(active_menu_id=target_id, hide_in_menu=True)

        route = menu_to_route(menu, {target_id: "manage_user"})

        assert route.meta.active_menu == "manage_user"

    def test_menu_to_route_keeps_optional_active_menu_null(self):
        menu = self._make_menu(active_menu_id=None)

        route = menu_to_route(menu, {})

        assert route.meta.active_menu is None


class TestBuildRouteTree:
    def _make_menu(self, id, parent_id=None, name="item"):
        menu = MagicMock()
        menu.id = id
        menu.parent_id = parent_id
        menu.menu_name = name
        menu.i18n_key = None
        menu.icon = None
        menu.icon_type = None
        menu.order = 0
        menu.constant = False
        menu.hide_in_menu = False
        menu.active_menu_id = None
        menu.keep_alive = False
        menu.href = None
        menu.multi_tab = False
        menu.fixed_index_in_tab = None
        menu.query = None
        menu.route_name = name
        menu.route_path = f"/{name}"
        menu.component = f"view.{name}"
        return menu

    def test_empty_list(self):
        result = build_route_tree([])
        assert result == []

    def test_single_root(self):
        root_id = uuid4()
        menu = self._make_menu(root_id)

        result = build_route_tree([menu])

        assert len(result) == 1
        assert result[0].name == "item"

    def test_parent_child_relationship(self):
        root_id = uuid4()
        child_id = uuid4()
        root = self._make_menu(root_id, name="parent")
        child = self._make_menu(child_id, parent_id=root_id, name="child")

        result = build_route_tree([root, child])

        assert len(result) == 1
        assert result[0].children is not None
        assert len(result[0].children) == 1
        assert result[0].children[0].name == "child"

    def test_orphan_child_excluded(self):
        child_id = uuid4()
        orphan_parent = uuid4()
        child = self._make_menu(child_id, parent_id=orphan_parent, name="orphan")

        result = build_route_tree([child])

        assert len(result) == 0


def test_page_menu_requires_permission():
    with pytest.raises(AppException) as exc_info:
        normalize_menu_permission(MenuType.MENU, False, None)

    assert exc_info.value.code == MenuStatusCode.MENU_PERMISSION_REQUIRED.code


def test_page_menu_rejects_unknown_permission():
    with pytest.raises(AppException) as exc_info:
        normalize_menu_permission(MenuType.MENU, False, "user:export")

    assert exc_info.value.code == MenuStatusCode.MENU_PERMISSION_UNKNOWN.code


@pytest.mark.parametrize(("menu_type", "constant"), [(MenuType.DIRECTORY, False), (MenuType.MENU, True)])
def test_directory_and_constant_menus_drop_permission(menu_type, constant):
    assert normalize_menu_permission(menu_type, constant, "user:read") is None


@pytest.mark.asyncio
async def test_create_page_menu_without_permission_is_rejected():
    crud = AsyncMock()
    data = MenuCreate(menu_name="page", menu_type=MenuType.MENU, route_name="page", route_path="/page")

    with pytest.raises(AppException) as exc_info:
        await create_menu(crud, data)

    assert exc_info.value.code == MenuStatusCode.MENU_PERMISSION_REQUIRED.code
    crud.create.assert_not_awaited()


@pytest.mark.asyncio
async def test_create_directory_stores_null_permission():
    created = make_menu("dir", menu_type=MenuType.DIRECTORY, permission=None)
    crud = AsyncMock()
    crud.create.return_value = created
    crud.get_route_name_map.return_value = {created.id: created.route_name}
    data = MenuCreate(menu_name="dir", menu_type=MenuType.DIRECTORY, route_name="dir", route_path="/dir", permission="user:read")

    await create_menu(crud, data)

    assert crud.create.call_args.args[0]["permission"] is None


@pytest.mark.asyncio
async def test_update_to_directory_clears_permission_and_partial_update_keeps_it():
    current = make_menu("page")
    crud = AsyncMock()
    crud.get.return_value = current
    crud.update_by_id.return_value = current
    crud.get_route_name_map.return_value = {current.id: current.route_name}
    crud.get_active_menu_references.return_value = []
    crud.get_parent_map.return_value = {current.id: None}
    crud.get_all_active_menu_bindings.return_value = []

    await update_menu(crud, current.id, MenuUpdate(menu_name="renamed"))
    assert crud.update_by_id.call_args.args[1]["permission"] == "user:read"

    await update_menu(crud, current.id, MenuUpdate(menu_type=MenuType.DIRECTORY))
    assert crud.update_by_id.call_args.args[1]["permission"] is None


@pytest.mark.asyncio
async def test_user_route_cache_key_changes_with_catalog_version(monkeypatch: pytest.MonkeyPatch):
    from plugin_menu.route.schemas import UserRouteResponse
    from plugin_menu.services import get_cached_user_routes

    redis = AsyncMock()
    redis.get.return_value = None
    redis.mget.return_value = ["1"]
    redis.lock = MagicMock(return_value=MagicMock(acquire=AsyncMock(return_value=True), release=AsyncMock()))
    monkeypatch.setattr(
        "plugin_menu.services.get_user_routes",
        AsyncMock(return_value=UserRouteResponse(routes=[], home="home")),
    )
    permission_cache = AsyncMock()
    monkeypatch.setattr("plugin_menu.services.get_service", lambda _: permission_cache)
    user = SimpleNamespace(is_admin=False, roles=["viewer"])

    permission_cache.get_catalog_version.return_value = 1
    await get_cached_user_routes(user, redis, AsyncMock())
    permission_cache.get_catalog_version.return_value = 2
    await get_cached_user_routes(user, redis, AsyncMock())

    keys = list(dict.fromkeys(call.args[0] for call in redis.get.await_args_list))
    assert len(keys) == 2
