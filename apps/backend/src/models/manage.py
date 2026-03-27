"""
Auth database models.

Author  : Coke
Date    : 2025-04-18
"""

from uuid import UUID

from pydantic import EmailStr
from sqlmodel import JSON, Column, Field

from src.schemas.manage import Button, Query
from src.utils.enums import MenuIconType, MenuType, Status

from .base import SQLModel


class User(SQLModel, table=True):
    """用户模型"""

    __tablename__ = "manage_users"

    name: str = Field(..., min_length=2, max_length=100, description="用户名")
    email: EmailStr = Field(..., unique=True, max_length=254, description="用户邮箱地址")
    username: str = Field(..., unique=True, min_length=5, max_length=100, description="用户登录名")
    password: bytes
    status: Status = Field(Status.ON, description="用户状态")
    is_admin: bool = Field(False, description="是否为管理员")
    roles: list[str] = Field([], sa_column=Column(JSON), description="用户角色编码列表")


class Role(SQLModel, table=True):
    """角色模型"""

    __tablename__ = "manage_roles"

    name: str = Field(..., unique=True, min_length=2, max_length=100, description="角色名称")
    description: str | None = Field(None, max_length=500, description="角色描述")
    code: str = Field(..., unique=True, min_length=5, max_length=100, description="角色编码")
    status: Status = Field(Status.ON, description="角色状态")
    interface_permissions: list[str] = Field([], sa_column=Column(JSON), description="接口权限编码列表")
    button_permissions: list[str] = Field([], sa_column=Column(JSON), description="按钮权限编码列表")
    router_permissions: list[str] = Field([], sa_column=Column(JSON), description="路由权限编码列表")


class Menu(SQLModel, table=True):
    """系统菜单模型"""

    __tablename__ = "manage_menus"

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


class InterfaceRouter(SQLModel, table=True):
    """FastAPI 应用路由模型"""

    __tablename__ = "manage_routers"

    name: str = Field(..., unique=True, max_length=100, description="接口路由功能名称")
    description: str | None = Field(None, description="接口路由功能描述")
    path: str = Field(..., description="接口路由路径")
    methods: list[str] = Field([], sa_column=Column(JSON), description="接口路由方法列表")
