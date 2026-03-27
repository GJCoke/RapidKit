from fastapi import Depends
from typing_extensions import Annotated, Doc

from src.crud.manage import MenuCRUD
from src.deps import SessionDep
from src.models.manage import Menu


async def get_menu_crud(session: SessionDep) -> MenuCRUD:
    """
    返回初始化了指定会话的 MenuCRUD 实例。

    Args:
        session: 用于数据库操作的会话依赖。

    Returns:
        MenuCRUD: 以 Menu 模型和指定会话初始化的 MenuCRUD 实例。
    """
    return MenuCRUD(Menu, session=session)


MenuCrudDep = Annotated[
    MenuCRUD,
    Depends(get_menu_crud),
    Doc(
        """
        依赖项：用于访问 MenuCRUD 实例。

        该依赖会注入用于操作菜单数据模型的 MenuCRUD 实例，
        可在需要基于菜单操作的路由中使用。
        """
    ),
]
