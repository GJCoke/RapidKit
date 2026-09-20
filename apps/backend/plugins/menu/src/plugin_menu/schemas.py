"""
系统管理相关数据结构。

Author : Coke
Date   : 2025-05-18
"""

from uuid import UUID

from pydantic import Field, model_validator
from pydantic.json_schema import SkipJsonSchema
from rapidkit_common.enums import MenuIconType, MenuType, Status
from rapidkit_common.schemas import BaseModel, BaseRequest, ResponseSchema
from rapidkit_common.schemas.request import PaginatedRequest


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


class MenuMutationSchema(MenuSchema):
    """菜单写入数据结构。"""

    active_menu: str | None = Field(None, description="高亮祖先菜单的路由名称")


class MenuResponse(MenuSchema, ResponseSchema):
    """菜单响应数据结构。"""

    active_menu: str | None = Field(None, description="高亮祖先菜单的路由名称")


class MenuListResponse(MenuResponse):
    children: list["MenuListResponse"] | None = None


class MenuCreate(MenuMutationSchema, BaseRequest):
    """创建菜单请求。"""


class MenuUpdate(BaseRequest):
    """更新菜单请求。"""

    menu_name: str | SkipJsonSchema[None] = Field(None, description="菜单名称")
    menu_type: MenuType | SkipJsonSchema[None] = Field(None, description="菜单类型: 1-目录, 2-菜单")
    order: int | SkipJsonSchema[None] = Field(None, description="排序序号")
    route_name: str | SkipJsonSchema[None] = Field(None, description="路由名称")
    route_path: str | SkipJsonSchema[None] = Field(None, description="路由路径")
    component: str | None = Field(None, description="组件路径")
    icon: str | None = Field(None, description="图标名称")
    icon_type: MenuIconType | SkipJsonSchema[None] = Field(None, description="图标类型")
    status: Status | SkipJsonSchema[None] = Field(None, description="状态")
    hide_in_menu: bool | SkipJsonSchema[None] = Field(None, description="是否隐藏")
    parent_id: UUID | None = Field(None, description="父级ID")
    i18n_key: str | None = Field(None, alias="i18nKey", description="国际化Key")
    keep_alive: bool | SkipJsonSchema[None] = Field(None, description="是否缓存")
    constant: bool | SkipJsonSchema[None] = Field(None, description="是否常量路由")
    href: str | None = Field(None, description="外链")
    multi_tab: bool | SkipJsonSchema[None] = Field(None, description="是否支持多页签")
    fixed_index_in_tab: int | None = Field(None, description="固定页签次序")
    query: list[Query] | SkipJsonSchema[None] = Field(None, description="路由参数")
    buttons: list[Button] | SkipJsonSchema[None] = Field(None, description="按钮权限")
    interfaces: list[str] | SkipJsonSchema[None] = Field(None, description="绑定的接口权限码列表")
    active_menu: str | None = Field(None, description="高亮祖先菜单的路由名称")

    @model_validator(mode="before")
    @classmethod
    def reject_null_for_non_nullable_fields(cls, data):
        """Allow omission for partial updates without making stored fields nullable."""
        if not isinstance(data, dict):
            return data
        non_nullable_fields = {
            "menu_name",
            "menuName",
            "menu_type",
            "menuType",
            "order",
            "route_name",
            "routeName",
            "route_path",
            "routePath",
            "icon_type",
            "iconType",
            "status",
            "hide_in_menu",
            "hideInMenu",
            "keep_alive",
            "keepAlive",
            "constant",
            "multi_tab",
            "multiTab",
            "query",
            "buttons",
            "interfaces",
        }
        null_fields = sorted(field for field in non_nullable_fields if field in data and data[field] is None)
        if null_fields:
            raise ValueError(f"Fields cannot be null: {', '.join(null_fields)}")
        return data


class MenuBatchRequest(BaseRequest):
    """批量操作菜单请求。"""

    ids: list[UUID] = Field(..., description="菜单 ID 列表")


class ActiveMenuOptionsQuery(BaseRequest):
    """祖先菜单候选项查询参数。"""

    parent_id: UUID | None = Field(None, description="当前页面的父菜单 ID")
    constant: bool = Field(False, description="当前页面是否为常量路由")


class ActiveMenuOption(BaseModel):
    """可作为侧边栏高亮目标的菜单。"""

    id: UUID
    route_name: str
    menu_name: str


class MenuQueriesSchema(BaseModel):
    """菜单查询数据结构。"""

    keyword: str = ""
    status: Status | None = None


class MenuPageQuery(MenuQueriesSchema, PaginatedRequest):
    """菜单分页查询请求。"""
