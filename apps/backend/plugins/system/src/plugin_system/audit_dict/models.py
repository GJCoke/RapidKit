"""
审计事件字典模型。

Author : Coke
Date   : 2026-04-20
"""

from rapidkit_common.models import SQLModel
from sqlmodel import Field, UniqueConstraint


class AuditDictionary(SQLModel, table=True):
    """审计事件字典 — 存储 resource/action 的多语言标签。"""

    __tablename__ = "system_audit_dictionaries"
    __table_args__ = (UniqueConstraint("key", "category", name="uq_audit_dict_key_category"),)

    key: str = Field(max_length=50, index=True, description="键名，如 user、create")
    category: str = Field(max_length=20, index=True, description="分类：resource 或 action")
    label_zh: str = Field(max_length=100, description="中文标签")
    label_en: str = Field(max_length=100, description="英文标签")
