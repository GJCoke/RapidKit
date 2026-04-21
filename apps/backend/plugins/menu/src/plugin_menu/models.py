"""
Menu database model.

Author  : Coke
Date    : 2025-04-18
"""

from uuid import UUID

from rapidkit_common.enums import MenuIconType, MenuType, Status
from rapidkit_common.models import SQLModel
from sqlmodel import JSON, Column, Field

from plugin_menu.schemas import Button, Query


class Menu(SQLModel, table=True):
    """系统菜单模型"""

    __tablename__ = "menu_menus"

    menu_name: str = Field(description="菜单名称")
    menu_type: MenuType = Field(default=MenuType.MENU, description="菜单类型: 1-目录, 2-菜单")
    order: int = Field(default=0, description="排序序号")
    route_name: str = Field(index=True, unique=True, description="路由名称 (对应前端 routeName)")
    route_path: str = Field(description="路由路径 (对应前端 routePath)")
    component: str | None = Field(default=None, description="组件路径")

    icon: str | None = Field(default=None, description="图标名称")
    icon_type: MenuIconType = Field(default=MenuIconType.ICONIFY, description="图标类型: 1-iconify, 2-local")

    status: Status = Field(default=Status.ON, description="菜单状态: 1-启用, 2-禁用")
    hide_in_menu: bool = Field(default=False, description="是否在菜单中隐藏")

    parent_id: UUID | None = Field(default=None, description="父级菜单ID (UUID string)")
    i18n_key: str | None = Field(default=None, description="国际x化Key")

    keep_alive: bool = Field(default=False, description="是否缓存页面")
    constant: bool = Field(default=False, description="是否为常量路由")
    href: str | None = Field(default=None, description="外链地址")

    # 扩展字段：多页签、固定页签等
    multi_tab: bool = Field(default=False, description="是否支持多页签")
    fixed_index_in_tab: int | None = Field(default=None, description="在页签中的固定次序")
    query: list[Query] = Field(default=[], sa_column=Column(JSON), description="路由参数")
    buttons: list[Button] = Field(default=[], sa_column=Column(JSON), description="按钮权限")
    interfaces: list[str] = Field(default=[], sa_column=Column(JSON), description="绑定的接口权限码")
