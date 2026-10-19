# apps/backend/plugins/permission/src/plugin_permission/catalog/schemas.py
"""
权限码目录响应结构。

Author : Coke
Date   : 2026-10-17
"""

from typing import Literal

from rapidkit_common.schemas.base import BaseModel


class CatalogDataScopeResponse(BaseModel):
    """资源可选的数据范围。"""

    key: str
    label: str


class CatalogFieldGroupResponse(BaseModel):
    """资源的字段组。"""

    key: str
    label: str
    fields: list[str]
    modes: list[Literal["masked", "hidden"]]


class CatalogResourceResponse(BaseModel):
    """资源。"""

    key: str
    label: str
    data_scopes: list[CatalogDataScopeResponse]
    field_groups: list[CatalogFieldGroupResponse]


class CatalogCodeResponse(BaseModel):
    """权限码。"""

    code: str
    resource: str
    label: str
    abac_action: str
    depends: list[str]
    source: str


class PermissionCatalogResponse(BaseModel):
    """权限码目录。"""

    resources: list[CatalogResourceResponse]
    codes: list[CatalogCodeResponse]
