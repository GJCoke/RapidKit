"""
PermissionExtension CRUD.

Author : Coke
Date   : 2026-10-17
"""

from rapidkit_common.crud import BaseCRUD
from sqlmodel import col, select

from plugin_permission.extension.models import PermissionExtension


class PermissionExtensionCRUD(BaseCRUD[PermissionExtension]):
    model = PermissionExtension

    async def list_ordered(self) -> list[PermissionExtension]:
        """按创建时间升序返回全部扩展（判定优先顺序）。"""
        result = await self.session.exec(select(PermissionExtension).order_by(col(PermissionExtension.create_time)))
        return list(result.all())
