"""Expose enabled, authorized business pages without sharing ORM models."""

import re
from uuid import UUID

from rapidkit_common.auth import UserProtocol
from rapidkit_common.enums import MenuType, Status
from rapidkit_common.protocols.menu import ActionParameter, ActionTarget
from rapidkit_common.protocols.permission import PermissionCacheManager
from rapidkit_framework.services import get_service
from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from plugin_menu.models import Menu
from plugin_menu.route.services import permitted_route_names

_PATH_PARAMETER = re.compile(r":([A-Za-z_][A-Za-z0-9_]*)(?:\([^)]*\))?([?*+]?)")


class MenuNavigationProvider:
    def __init__(self, permission_provider: PermissionCacheManager | None = None) -> None:
        self._permission_provider = permission_provider

    async def _targets(self, session: AsyncSession, user: UserProtocol | None) -> list[ActionTarget]:
        menus = list((await session.exec(select(Menu).order_by(col(Menu.order), col(Menu.id)))).all())
        menu_map = {menu.id: menu for menu in menus}
        permitted = None
        if user is not None and not user.is_admin:
            provider = self._permission_provider or get_service(PermissionCacheManager)
            permitted = permitted_route_names(menus, await provider.get_role_codes(user.roles or []))
        targets = []
        for menu in menus:
            if menu.menu_type != MenuType.MENU or menu.href or not menu.component:
                continue
            if "iframe" in menu.component.lower():
                continue
            if not menu.route_path.startswith("/") or menu.route_path.startswith("//"):
                continue
            # Constant pages are public routes, including hidden login/error pages.
            if permitted is not None and not menu.constant and menu.route_name not in permitted:
                continue
            ancestors = []
            visited = {menu.id}
            current = menu
            valid = True
            while True:
                if current.status != Status.ON:
                    valid = False
                    break
                if current.parent_id is None:
                    break
                parent = menu_map.get(current.parent_id)
                if parent is None or parent.id in visited:
                    valid = False
                    break
                visited.add(parent.id)
                ancestors.append(parent)
                if (
                    permitted is not None
                    and not parent.constant
                    and parent.menu_type == MenuType.MENU
                    and parent.route_name not in permitted
                ):
                    valid = False
                    break
                current = parent
            if not valid or menu.active_menu_id is not None and menu.active_menu_id not in {a.id for a in ancestors}:
                continue
            parameters = [
                ActionParameter(
                    name=match[1],
                    location="path",
                    required=match[2] not in {"?", "*"},
                )
                for match in _PATH_PARAMETER.finditer(menu.route_path)
            ]
            parameters.extend(
                ActionParameter(name=query["key"], location="query", required=False, default_value=query.get("value"))
                for item in menu.query or []
                if (query := item.model_dump() if hasattr(item, "model_dump") else item).get("key")
            )
            targets.append(
                ActionTarget(
                    menu_id=menu.id,
                    label=menu.menu_name,
                    breadcrumb=[a.menu_name for a in reversed(ancestors)] + [menu.menu_name],
                    route=menu.route_name,
                    path=menu.route_path,
                    parameters=parameters,
                )
            )
        return targets

    async def list_targets(self, session: AsyncSession, user: UserProtocol) -> list[ActionTarget]:
        return await self._targets(session, user)

    async def get_target(
        self, session: AsyncSession, menu_id: UUID, user: UserProtocol | None = None
    ) -> ActionTarget | None:
        return next((target for target in await self._targets(session, user) if target.menu_id == menu_id), None)
