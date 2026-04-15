"""
Menu domain dependencies.

Author  : Claude
Date    : 2026-04-14
"""

from fastapi import Depends
from typing_extensions import Annotated, Doc

from rapidkit_common.deps import SessionDep
from plugin_menu.crud import MenuCRUD
from plugin_menu.models import Menu


async def get_menu_crud(session: SessionDep) -> MenuCRUD:
    return MenuCRUD(Menu, session=session)


MenuCrudDep = Annotated[
    MenuCRUD,
    Depends(get_menu_crud),
    Doc("依赖项：提供 MenuCRUD 实例，用于菜单数据操作。"),
]
