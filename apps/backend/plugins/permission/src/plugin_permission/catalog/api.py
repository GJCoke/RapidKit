# 权限码目录查询接口。
"""
权限码目录接口。

Author : Coke
Date   : 2026-10-17
"""

from fastapi import APIRouter
from rapidkit_common.access import Require
from rapidkit_common.schemas.response import Response

from plugin_permission.catalog.registry import get_catalog
from plugin_permission.catalog.schemas import PermissionCatalogResponse
from plugin_permission.catalog.services import build_catalog_response

router = APIRouter(prefix="/permission-catalog", tags=["PermissionCatalog"])


@router.get("", summary="权限码目录", dependencies=[Require("role:read")])
async def get_permission_catalog() -> Response[PermissionCatalogResponse]:
    """返回资源与权限码（含 depends 与来源），供角色配置使用。"""
    return Response(data=build_catalog_response(get_catalog()))
