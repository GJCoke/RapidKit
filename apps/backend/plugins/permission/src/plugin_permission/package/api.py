"""
功能包 API：CRUD 与应用到角色。

Author : Coke
Date   : 2026-10-17
"""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from rapidkit_common.access import Require, Scope
from rapidkit_common.deps import RedisDep, SessionDep
from rapidkit_common.schemas.response import PaginatedResponse, Response
from rapidkit_common.transaction import after_commit
from rapidkit_core.log import get_plugin_logger
from sqlmodel import col, or_

from plugin_permission.package import services
from plugin_permission.package.crud import PermissionPackageCRUD
from plugin_permission.package.models import PermissionPackage
from plugin_permission.package.schemas import (
    ApplyPackagesBody,
    ApplyPackagesResponse,
    PackageCreate,
    PackageListQuery,
    PackageResponse,
    PackageUpdate,
    ScopeChangeResponse,
)
from plugin_permission.role.services import publish_role_change

logger = get_plugin_logger("Permission")

router = APIRouter(prefix="/permission-packages", tags=["PermissionPackage"])
apply_router = APIRouter(prefix="/roles", tags=["Role"])


async def get_crud(session: SessionDep) -> PermissionPackageCRUD:
    return PermissionPackageCRUD(session)


PackageCrudDep = Annotated[PermissionPackageCRUD, Depends(get_crud)]


@router.get("", dependencies=[Require("permission-package:read")])
async def list_packages(
    query: Annotated[PackageListQuery, Query(...)],
    crud: PackageCrudDep,
) -> Response[PaginatedResponse[PackageResponse]]:
    """分页查询权限功能包，支持按名称或标识搜索。"""
    filters = []
    if query.keyword:
        escaped = query.keyword.replace("%", r"\%").replace("_", r"\_")
        filters.append(
            or_(col(PermissionPackage.label).like(f"%{escaped}%"), col(PermissionPackage.key).like(f"%{escaped}%"))
        )
    result = await crud.get_paginate(
        *filters,
        page=query.page,
        size=query.page_size,
        order_by=col(PermissionPackage.key),
        schema=PackageResponse,
    )
    return Response(data=result)


@router.get("/all", dependencies=[Require("permission-package:read")])
async def list_all_packages(crud: PackageCrudDep) -> Response[list[PackageResponse]]:
    """全部功能包（不分页，用于应用到角色）。"""
    packages = await crud.get_all(order_by=col(PermissionPackage.key), schema=PackageResponse)
    return Response(data=packages)


@router.post("")
async def create_package(
    scope: Annotated[Scope, Require("permission-package:create")],
    body: PackageCreate,
    crud: PackageCrudDep,
) -> Response[PackageResponse]:
    """校验权限码、范围和字段设置后创建自定义功能包。"""
    data_scopes, field_modes = await services.validate_package_content(body.codes, body.data_scopes, body.field_modes)
    package = await crud.create(
        {**body.model_dump(), "data_scopes": data_scopes, "field_modes": field_modes, "builtin": False}
    )
    logger.info("Permission package created: key={key} user_id={user_id}", key=package.key, user_id=scope.user.id)
    return Response(data=PackageResponse.model_validate(package))


@router.put("/{package_id}")
async def update_package(
    scope: Annotated[Scope, Require("permission-package:update")],
    package_id: UUID,
    body: PackageUpdate,
    crud: PackageCrudDep,
) -> Response[PackageResponse]:
    """校验并更新自定义功能包，内置功能包不可修改。"""
    package = await crud.get(package_id, nullable=False)
    services.ensure_editable(package)
    changes = body.model_dump(exclude_unset=True)
    data_scopes, field_modes = await services.validate_package_content(
        changes.get("codes", package.codes),
        changes.get("data_scopes", package.data_scopes),
        changes.get("field_modes", package.field_modes),
    )
    if "data_scopes" in changes:
        changes["data_scopes"] = data_scopes
    if "field_modes" in changes:
        changes["field_modes"] = field_modes
    package = await crud.update_by_id(package_id, changes)
    logger.info("Permission package updated: key={key} user_id={user_id}", key=package.key, user_id=scope.user.id)
    return Response(data=PackageResponse.model_validate(package))


@router.delete("/{package_id}")
async def delete_package(
    scope: Annotated[Scope, Require("permission-package:delete")],
    package_id: UUID,
    crud: PackageCrudDep,
) -> Response[bool]:
    """删除自定义功能包，内置功能包不可删除。"""
    package = await crud.get(package_id, nullable=False)
    services.ensure_editable(package)
    await crud.delete(package_id)
    logger.info("Permission package deleted: key={key} user_id={user_id}", key=package.key, user_id=scope.user.id)
    return Response(data=True)


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
