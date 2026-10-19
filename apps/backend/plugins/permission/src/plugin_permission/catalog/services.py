# apps/backend/plugins/permission/src/plugin_permission/catalog/services.py
"""
权限码目录 → 接口响应。

Author : Coke
Date   : 2026-10-17
"""

from plugin_permission.catalog.registry import PermissionCatalog
from plugin_permission.catalog.schemas import (
    CatalogCodeResponse,
    CatalogDataScopeResponse,
    CatalogFieldGroupResponse,
    CatalogResourceResponse,
    PermissionCatalogResponse,
)


def build_catalog_response(catalog: PermissionCatalog) -> PermissionCatalogResponse:
    """资源按 key、码按 code 排序输出；数据范围与字段组保持声明顺序。"""
    return PermissionCatalogResponse(
        resources=[
            CatalogResourceResponse(
                key=resource.key,
                label=resource.label,
                data_scopes=[
                    CatalogDataScopeResponse(key=scope.key, label=scope.label) for scope in resource.data_scopes
                ],
                field_groups=[
                    CatalogFieldGroupResponse(
                        key=group.key, label=group.label, fields=list(group.fields), modes=list(group.modes)
                    )
                    for group in resource.field_groups
                ],
            )
            for _, resource in sorted(catalog.resources.items())
        ],
        codes=[
            CatalogCodeResponse(
                code=item.code,
                resource=item.resource,
                label=item.label,
                abac_action=item.abac_action,
                depends=list(item.depends),
                source=item.source,
            )
            for _, item in sorted(catalog.codes.items())
        ],
    )
