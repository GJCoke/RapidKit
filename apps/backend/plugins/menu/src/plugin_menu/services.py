"""
菜单查询过滤服务。

Author : Coke
Date   : 2025-05-18
"""

from sqlalchemy import ColumnElement
from sqlmodel import col, or_

from plugin_menu.models import Menu
from rapidkit_common.enums import Status


def filter_menu(status: "Status | None", keyword: str) -> list[ColumnElement[bool]]:
    """生成用于查询菜单的 SQLAlchemy 过滤条件。"""
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
