"""
Department API endpoints.

Author : Coke
Date   : 2026-05-11
"""

from uuid import UUID

from fastapi import APIRouter
from rapidkit_common.access import Require
from rapidkit_common.deps import RedisDep
from rapidkit_common.events import DepartmentDeletedEvent
from rapidkit_common.schemas.response import Response
from rapidkit_common.transaction import after_commit
from rapidkit_framework.events import event_bus
from sqlmodel import col

from plugin_department.deps import DepartmentCrudDep
from plugin_department.models import Department
from plugin_department.providers import bump_dept_tree_version
from plugin_department.schemas import (
    DepartmentCreate,
    DepartmentResponse,
    DepartmentTreeNode,
    DepartmentUpdate,
)
from plugin_department.services import build_tree, check_delete_allowed

router = APIRouter(prefix="/departments", tags=["Department"])


@router.get("/tree", summary="部门树", dependencies=[Require("department:read")])
async def get_department_tree(crud: DepartmentCrudDep) -> Response[list[DepartmentTreeNode]]:
    """返回当前数据范围内的部门树；父部门不可见时子树提升为根。"""
    departments = await crud.get_all(order_by=col(Department.sort))
    return Response(data=build_tree(departments))


@router.post("", summary="创建部门", dependencies=[Require("department:create")])
async def create_department(
    body: DepartmentCreate, crud: DepartmentCrudDep, redis: RedisDep
) -> Response[DepartmentResponse]:
    """创建新部门；父部门必须可见，新部门必须落在数据范围内。"""
    if body.parent_id is not None:
        await crud.get(body.parent_id, nullable=False)
    dept = await crud.create(body)
    after_commit(crud.session, bump_dept_tree_version, redis)
    return Response(data=DepartmentResponse.model_validate(dept))


@router.put("/{dept_id}", summary="更新部门", dependencies=[Require("department:update")])
async def update_department(
    dept_id: UUID, body: DepartmentUpdate, crud: DepartmentCrudDep, redis: RedisDep
) -> Response[DepartmentResponse]:
    """更新部门信息；新的父部门必须可见。"""
    update_data = body.model_dump(exclude_unset=True)
    if update_data.get("parent_id") is not None:
        await crud.get(update_data["parent_id"], nullable=False)
    dept = await crud.update_by_id(dept_id, update_data)
    after_commit(crud.session, bump_dept_tree_version, redis)
    return Response(data=DepartmentResponse.model_validate(dept))


@router.delete("/{dept_id}", summary="删除部门", dependencies=[Require("department:delete")])
async def delete_department(dept_id: UUID, crud: DepartmentCrudDep, redis: RedisDep) -> Response[DepartmentResponse]:
    """删除范围内的部门（存在子部门时拒绝）。"""
    await crud.get(dept_id, nullable=False)
    await check_delete_allowed(crud, dept_id)
    dept = await crud.delete(dept_id)
    await event_bus.async_emit(DepartmentDeletedEvent(department_id=str(dept_id)))
    after_commit(crud.session, bump_dept_tree_version, redis)
    return Response(data=DepartmentResponse.model_validate(dept))
