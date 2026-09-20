"""Public menu response conversion helpers."""

from uuid import UUID

from plugin_menu.models import Menu
from plugin_menu.schemas import MenuListResponse, MenuResponse


def to_menu_response(menu: Menu, route_names: dict[UUID, str]) -> MenuResponse:
    """Convert a menu model to its public shape without exposing storage IDs."""
    response = MenuResponse.model_validate(menu)
    response.active_menu = route_names.get(menu.active_menu_id) if menu.active_menu_id else None
    return response


def to_menu_list_response(menu: Menu, route_names: dict[UUID, str]) -> MenuListResponse:
    """Convert a menu model to its public tree-response shape."""
    response = MenuListResponse.model_validate(menu)
    response.active_menu = route_names.get(menu.active_menu_id) if menu.active_menu_id else None
    return response
