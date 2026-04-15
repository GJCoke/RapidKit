"""
Author  : Coke
Date    : 2025-04-30
"""

from sqlalchemy import ColumnElement
from sqlmodel import col, or_

from plugin_auth.role.models import Role
from rapidkit_common.enums import Status


def filter_role(status: Status | None, keyword: str) -> list[ColumnElement[bool]]:
    filter = []

    if status is not None:
        filter.append(col(Role.status) == status)

    if keyword:
        filter.append(or_(col(Role.name).like(f"%{keyword}%"), col(Role.code).like(f"%{keyword}%")))

    return filter
