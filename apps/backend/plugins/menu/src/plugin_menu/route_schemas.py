"""
前端动态路由相关数据结构。

Author : Coke
Date   : 2026-04-02
"""

from pydantic import Field
from rapidkit_common.schemas import BaseModel


class RouteMeta(BaseModel):
    """路由元信息，对应前端 ElegantConstRoute 的 meta 字段。"""

    title: str
    i18n_key: str | None = Field(None, serialization_alias="i18nKey")
    icon: str | None = None
    local_icon: str | None = None
    order: int = 0
    constant: bool = False
    hide_in_menu: bool = False
    keep_alive: bool = False
    href: str | None = None
    multi_tab: bool = False
    fixed_index_in_tab: int | None = None
    query: list[dict] | None = None


class MenuRouteResponse(BaseModel):
    """菜单转换为前端路由的响应格式。"""

    id: str
    name: str
    path: str
    component: str | None = None
    meta: RouteMeta
    children: list[MenuRouteResponse] | None = None


class UserRouteResponse(BaseModel):
    """用户路由响应，包含路由列表和首页路由名。"""

    routes: list[MenuRouteResponse]
    home: str
