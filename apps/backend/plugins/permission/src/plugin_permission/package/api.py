"""服务器声明功能包的只读列表。"""

from fastapi import APIRouter
from rapidkit_common.access import Require
from rapidkit_common.schemas.response import Response

from plugin_permission.catalog.registry import get_catalog
from plugin_permission.package.schemas import PackageResponse

router = APIRouter(prefix="/permission-packages", tags=["PermissionPackage"])


@router.get("/all", dependencies=[Require("role:grant")])
async def list_all_packages() -> Response[list[PackageResponse]]:
    """读取服务器代码中的功能包，不查询数据库。"""
    return Response(
        data=[
            PackageResponse(
                key=item.key,
                label=item.label,
                description=item.description,
                codes=list(item.codes),
                data_scopes={},
                field_modes={},
            )
            for _, item in sorted(get_catalog().packages.items())
        ]
    )
