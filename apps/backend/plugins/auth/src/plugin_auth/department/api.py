"""
部门管理 API。

Author : Coke
Date   : 2026-04-20
"""

from uuid import UUID

from fastapi import APIRouter, Depends
from rapidkit_common.auth import verify_user_permission
from rapidkit_common.schemas.response import Response
from sqlmodel import col

from plugin_auth.department.deps import DepartmentCrudDep
from plugin_auth.department.models import Department
from plugin_auth.department.schemas import (
    DepartmentCreate,
    DepartmentResponse,
    DepartmentTreeNode,
    DepartmentUpdate,
)
from plugin_auth.department.services import build_tree, check_delete_allowed

router = APIRouter(
    prefix="/departments",
    tags=["Department"],
    dependencies=[Depends(verify_user_permission)],
)


@router.get("/tree", summary="部门树")
async def get_department_tree(crud: DepartmentCrudDep) -> Response[list[DepartmentTreeNode]]:
    """返回完整部门树。"""
    departments = await crud.get_all(order_by=col(Department.sort))
    tree = build_tree(departments)
    return Response(data=tree)


@router.post("", summary="创建部门")
async def create_department(body: DepartmentCreate, crud: DepartmentCrudDep) -> Response[DepartmentResponse]:
    """创建新部门。"""
    dept = await crud.create(body)
    return Response(data=DepartmentResponse.model_validate(dept))


@router.put("/{dept_id}", summary="更新部门")
async def update_department(
    dept_id: UUID, body: DepartmentUpdate, crud: DepartmentCrudDep
) -> Response[DepartmentResponse]:
    """更新部门信息。"""
    dept = await crud.update_by_id(dept_id, body.model_dump(exclude_unset=True))
    return Response(data=DepartmentResponse.model_validate(dept))


@router.delete("/{dept_id}", summary="删除部门")
async def delete_department(dept_id: UUID, crud: DepartmentCrudDep) -> Response[DepartmentResponse]:
    """删除部门（需检查子部门）。"""
    await check_delete_allowed(crud, dept_id)
    dept = await crud.delete(dept_id)
    return Response(data=DepartmentResponse.model_validate(dept))
