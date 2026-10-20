"""服务器声明功能包的只读列表及角色应用接口。"""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter
from rapidkit_common.access import Require, Scope
from rapidkit_common.deps import RedisDep, SessionDep
from rapidkit_common.schemas.response import Response
from rapidkit_common.transaction import after_commit
from rapidkit_core.log import get_plugin_logger

from plugin_permission.catalog.registry import get_catalog
from plugin_permission.package import services
from plugin_permission.package.schemas import (
    ApplyPackagesBody,
    ApplyPackagesResponse,
    PackageResponse,
    ScopeChangeResponse,
)
from plugin_permission.role.services import publish_role_change

logger = get_plugin_logger("Permission")
router = APIRouter(prefix="/permission-packages", tags=["PermissionPackage"])
apply_router = APIRouter(prefix="/roles", tags=["Role"])


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


@apply_router.post("/{role_id}/apply-packages")
async def apply_packages(
    scope: Annotated[Scope, Require("role:grant")],
    role_id: UUID,
    body: ApplyPackagesBody,
    session: SessionDep,
    redis: RedisDep,
) -> Response[ApplyPackagesResponse]:
    """将功能包合并或替换到角色权限，并返回权限与范围变更。"""
    result = await services.apply_packages_to_role(session, role_id, body.package_keys, body.mode)
    logger.warning(
        "Permission packages applied: role={role_code} packages={packages} mode={mode} user_id={user_id}",
        role_code=result.role.code,
        packages=body.package_keys,
        mode=body.mode,
        user_id=scope.user.id,
    )
    after_commit(session, publish_role_change, redis, [result.role.code], operator_id=scope.user.id)
    return Response(
        data=ApplyPackagesResponse.model_validate(
            {
                "permission_codes": result.role.permission_codes,
                "data_scopes": result.role.data_scopes,
                "field_modes": result.role.field_modes,
                "added_codes": result.diff.added_codes,
                "removed_codes": result.diff.removed_codes,
                "scope_changes": [
                    ScopeChangeResponse(resource=c.resource, group=c.group, before=c.before, after=c.after)
                    for c in result.diff.scope_changes
                ],
            }
        )
    )
