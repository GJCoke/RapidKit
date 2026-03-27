"""
Author  : Coke
Date    : 2025-04-30
"""

from sqlalchemy import ColumnElement
from sqlmodel import col, or_

from src.models import Role
from src.utils.enums import Status


def filter_role(status: Status | None, keyword: str) -> list[ColumnElement[bool]]:
    """
    生成用于查询角色的 SQLAlchemy 过滤条件。

    Args:
        status: 角色状态过滤条件，为 None 时忽略。
        keyword: 用于角色名称或编码的模糊搜索关键字。

    Returns:
        SQLAlchemy 过滤表达式列表。
    """
    filter = []

    if status is not None:
        filter.append(col(Role.status) == status)

    if keyword:
        filter.append(or_(col(Role.name).like(f"%{keyword}%"), col(Role.code).like(f"%{keyword}%")))

    return filter
