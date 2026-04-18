"""
Author  : Coke
Date    : 2025-04-30
"""

from rapidkit_common.enums import Status
from sqlalchemy import ColumnElement
from sqlmodel import col, or_

from plugin_auth.role.models import Role


def filter_role(status: Status | None, keyword: str) -> list[ColumnElement[bool]]:
    filter = []

    if status is not None:
        filter.append(col(Role.status) == status)

    if keyword:
        escaped = keyword.replace("%", r"\%").replace("_", r"\_")
        filter.append(or_(col(Role.name).like(f"%{escaped}%"), col(Role.code).like(f"%{escaped}%")))

    return filter
