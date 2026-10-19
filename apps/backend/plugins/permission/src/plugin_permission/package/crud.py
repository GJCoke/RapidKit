"""
功能包 CRUD。

Author : Coke
Date   : 2026-10-17
"""

from rapidkit_common.crud import BaseCRUD
from sqlmodel import col

from plugin_permission.package.models import PermissionPackage


class PermissionPackageCRUD(BaseCRUD[PermissionPackage]):
    model = PermissionPackage

    async def get_by_keys(self, keys: list[str]) -> list[PermissionPackage]:
        """按 key 查询，返回顺序与 ``keys`` 一致，缺失的 key 被跳过。"""
        rows = await self.get_all(col(self.model.key).in_(keys))
        by_key = {row.key: row for row in rows}
        return [by_key[key] for key in keys if key in by_key]
