"""
PermissionExtension model — 只能追加的运行时扩展层。

Author : Coke
Date   : 2026-10-17
"""

from rapidkit_common.models import SQLModel
from sqlmodel import Field


class PermissionExtension(SQLModel, table=True):
    """权限扩展：接口绑定 / 追加依赖 / 自定义码。"""

    __tablename__ = "permission_extensions"

    kind: str = Field(max_length=20, index=True, description="route_binding / depends / custom_code")
    code: str = Field(max_length=100, index=True, description="扩展作用的权限码")
    route_key: str | None = Field(default=None, max_length=500, description="route_binding：接口 route key")
    depends_on: str | None = Field(default=None, max_length=100, description="depends：追加的依赖码")
    resource: str | None = Field(default=None, max_length=100, description="custom_code：所属资源")
    label: str | None = Field(default=None, max_length=100, description="custom_code：显示名称")
    abac_action: str | None = Field(default=None, max_length=10, description="custom_code：read / write")
    note: str = Field(default="", max_length=500, description="备注")
