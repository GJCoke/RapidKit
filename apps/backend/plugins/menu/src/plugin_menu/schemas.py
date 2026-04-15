"""
系统管理相关数据结构。

Author : Coke
Date   : 2025-05-18
"""

from uuid import UUID

from pydantic import Field

from rapidkit_common.schemas import BaseModel, BaseRequest, ResponseSchema
from rapidkit_common.schemas.request import PaginatedRequest
from rapidkit_common.enums import MenuIconType, MenuType, Status


class Query(BaseModel):
    key: str
    value: str


class Button(BaseModel):
    code: str
    desc: str


class MenuSchema(BaseModel):
    """菜单基础数据结构。"""

    menu_name: str = Field(..., description="菜单名称")
    menu_type: MenuType = Field(MenuType.DIRECTORY, description="菜单类型: 1-目录, 2-菜单")
    order: int = Field(0, description="排序序号")
    route_name: str = Field(..., description="路由名称")
    route_path: str = Field(..., description="路由路径")
    component: str | None = Field(None, description="组件路径")
    icon: str | None = Field(None, description="图标名称")
    icon_type: MenuIconType = Field(MenuIconType.ICONIFY, description="图标类型")
    status: Status = Field(Status.ON, description="状态")
    hide_in_menu: bool = Field(False, description="是否隐藏")
    parent_id: UUID | None = Field(None, description="父级ID")
    i18n_key: str | None = Field(None, alias="i18nKey", description="国际化Key")
    keep_alive: bool = Field(False, description="是否缓存")
    constant: bool = Field(False, description="是否常量路由")
    href: str | None = Field(None, description="外链")
    multi_tab: bool = Field(False, description="是否支持多页签")
    fixed_index_in_tab: int | None = Field(None, description="固定页签次序")
    query: list[Query] = Field([], description="路由参数")
    buttons: list[Button] = Field([], description="按钮权限")
    interfaces: list[str] = Field([], description="绑定的接口权限码列表")


class MenuResponse(MenuSchema, ResponseSchema):
    """菜单响应数据结构。"""


class MenuListResponse(MenuResponse):
    children: list["MenuListResponse"] | None = None


class MenuCreate(MenuSchema, BaseRequest):
    """创建菜单请求。"""


class MenuUpdate(MenuSchema, BaseRequest):
    """更新菜单请求。"""


class MenuBatchRequest(BaseRequest):
    """批量操作菜单请求。"""

    ids: list[UUID] = Field(..., description="菜单 ID 列表")


class MenuQueriesSchema(BaseModel):
    """菜单查询数据结构。"""

    keyword: str = ""
    status: Status | None = None


class MenuPageQuery(MenuQueriesSchema, PaginatedRequest):
    """菜单分页查询请求。"""
