"""
Menu domain dependencies.

Author  : Claude
Date    : 2026-04-14
"""

from fastapi import Depends
from rapidkit_common.deps import SessionDep
from typing_extensions import Annotated, Doc

from plugin_menu.crud import MenuCRUD


async def get_menu_crud(session: SessionDep) -> MenuCRUD:
    return MenuCRUD(session)


MenuCrudDep = Annotated[
    MenuCRUD,
    Depends(get_menu_crud),
    Doc("依赖项：提供 MenuCRUD 实例，用于菜单数据操作。"),
]
