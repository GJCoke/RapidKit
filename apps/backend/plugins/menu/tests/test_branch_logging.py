from types import SimpleNamespace as NS
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from plugin_menu import services, api
from plugin_menu.models import Menu
from plugin_menu.schemas import MenuCreate, MenuUpdate, MenuBatchRequest
from rapidkit_common.enums import MenuType
from tests.testing.utils import one_event


@pytest.mark.parametrize("update", [False, True])
@pytest.mark.parametrize(
    "kind,event,reason",
    [
        (MenuType.MENU, "menu.active_menu.fallback", "active_menu_ignored"),
        (MenuType.DIRECTORY, "menu.permission.fallback", "permission_not_applicable"),
    ],
)
async def test_ignored_menu_inputs(update, kind, event, reason, monkeypatch, json_log):
    current = Menu(
        menu_name="private-menu", menu_type=kind, route_name="page", route_path="/page", permission="user:read"
    )
    crud = AsyncMock()
    crud.get.return_value = current
    crud.get_route_name_map.return_value = {}
    crud.create.side_effect = lambda values: Menu(**values)
    crud.update_by_id.side_effect = lambda mid, values: Menu(**{**current.model_dump(), **values})
    monkeypatch.setattr(services, "get_service", lambda _: NS(has_code=lambda _: True))
    monkeypatch.setattr(services, "ensure_update_preserves_active_menu_bindings", AsyncMock())
    values = {
        "menu_name": "private-menu",
        "menu_type": kind,
        "route_name": "page",
        "route_path": "/page",
        "permission": "user:read",
    }
    if kind == MenuType.MENU:
        values["active_menu"] = "other"
    if update:
        result = await services.update_menu(crud, current.id, MenuUpdate(**values))
    else:
        result = await services.create_menu(crud, MenuCreate(**values))
    assert result.active_menu is None
    if kind == MenuType.DIRECTORY:
        assert result.permission is None
    row = one_event(json_log(), event)
    assert (row["level"], row["outcome"], row["reason_code"], row["resource_type"]) == (
        "INFO",
        "fallback",
        reason,
        "menu",
    )
    if update:
        assert row["resource_id"] == str(current.id)
    assert "private-" not in str(json_log())


async def test_empty_authorized_routes(monkeypatch, json_log):
    from plugin_menu.route import services as routes

    uid = uuid4()
    session = NS(exec=AsyncMock(return_value=NS(all=lambda: [])))
    result = await routes.get_user_routes(NS(id=uid, is_admin=True), session)
    assert result.home == "home" and result.routes == []
    row = one_event(json_log(), "menu.route.fallback")
    assert (row["level"], row["outcome"], row["reason_code"], row["user_id"]) == (
        "INFO",
        "fallback",
        "no_accessible_route",
        str(uid),
    )
    assert "private-" not in str(json_log())


def test_orphan_routes_summary(json_log):
    from plugin_menu.route.services import build_route_tree

    menus = [
        Menu(menu_name="private-menu", route_name=f"orphan{i}", route_path="/page", parent_id=uuid4()) for i in range(2)
    ]
    assert build_route_tree(menus) == []
    row = one_event(json_log(), "menu.route.filtered")
    assert (row["level"], row["outcome"], row["reason_code"], row["filtered_count"]) == (
        "DEBUG",
        "filtered",
        "orphan_route_dropped",
        2,
    )
    assert "private-" not in str(json_log())


async def test_orphan_tree_summary(monkeypatch, json_log):
    from plugin_menu.crud import MenuCRUD

    root = Menu(menu_name="private-root", route_name="root", route_path="/root")
    orphan = Menu(menu_name="private-orphan", route_name="orphan", route_path="/orphan", parent_id=uuid4())
    crud = MenuCRUD(None)
    monkeypatch.setattr(crud, "get_paginate", AsyncMock(return_value=NS(records=[root], total=1, page=1, page_size=10)))
    monkeypatch.setattr(crud, "get_all", AsyncMock(return_value=[root, orphan]))
    result = await crud.get_menu_paginated_tree()
    assert [m.id for m in result.records] == [root.id]
    row = one_event(json_log(), "menu.tree.degraded")
    assert (row["level"], row["outcome"], row["reason_code"], row["filtered_count"]) == (
        "WARNING",
        "degraded",
        "orphan_menu_dropped",
        1,
    )
    assert "private-" not in str(json_log())


@pytest.mark.parametrize("operation", ["create", "update", "delete", "batch"])
async def test_audited_menu_mutations_do_not_repeat_info(operation, monkeypatch, json_log):
    model = Menu(menu_name="private-menu", route_name="page", route_path="/page")
    menu = services.to_menu_response(model, {})
    monkeypatch.setattr(api, "create_menu_service", AsyncMock(return_value=menu))
    monkeypatch.setattr(api, "update_menu_service", AsyncMock(return_value=menu))
    monkeypatch.setattr(api, "delete_menu_service", AsyncMock())
    monkeypatch.setattr(api, "delete_menus_service", AsyncMock())
    monkeypatch.setattr(api.event_bus, "fire_and_forget", lambda *_: None)
    monkeypatch.setattr(api, "after_commit", lambda *_: None)
    if operation == "create":
        await api.add_menu(
            MenuCreate(menu_name="private-menu", route_name="page", route_path="/page"), None, None, None
        )
    elif operation == "update":
        await api.update_menu(model.id, MenuUpdate(menu_name="private-menu"), None, None, None)
    elif operation == "delete":
        await api.delete_menu(model.id, None, None, None)
    else:
        await api.batch_delete_menus(MenuBatchRequest(ids=[model.id]), None, None, None)
    assert not [r for r in json_log() if r["level"] == "INFO"]
    assert "private-" not in str(json_log())
