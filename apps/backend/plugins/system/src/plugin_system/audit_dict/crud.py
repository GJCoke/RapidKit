"""
审计字典 CRUD。

Author : Coke
Date   : 2026-04-20
"""

from rapidkit_common.crud import BaseCRUD
from sqlmodel import select

from plugin_system.audit_dict.models import AuditDictionary


class AuditDictCRUD(BaseCRUD[AuditDictionary]):
    """审计字典数据操作。"""

    model = AuditDictionary

    async def get_all_grouped(self) -> dict[str, list[AuditDictionary]]:
        """获取所有字典条目，按 category 分组。"""
        statement = select(self.model).order_by(self.model.category, self.model.key)
        result = await self.session.exec(statement)
        items = list(result.all())
        grouped: dict[str, list[AuditDictionary]] = {"resource": [], "action": []}
        for item in items:
            grouped.setdefault(item.category, []).append(item)
        return grouped
