from sqlalchemy import ColumnElement
from sqlmodel import col, or_

from src.domains.menu.models import Menu


def filter_menu(status: bool | None, keyword: str) -> list[ColumnElement[bool]]:
    """
    生成用于查询菜单的 SQLAlchemy 过滤条件。

    Args:
        status: 菜单状态过滤条件，为 None 时忽略。
        keyword: 用于菜单名称或路由路径的模糊搜索关键字。

    Returns:
        SQLAlchemy 过滤表达式列表。
    """
    filters: list[ColumnElement[bool]] = [col(Menu.parent_id).is_(None)]

    if status is not None:
        filters.append(col(Menu.status) == status)

    if keyword:
        filters.append(
            or_(
                col(Menu.menu_name).like(f"%{keyword}%"),
                col(Menu.route_path).like(f"%{keyword}%"),
            )
        )

    return filters
