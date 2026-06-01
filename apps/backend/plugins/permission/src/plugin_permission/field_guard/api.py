"""
FieldPolicy CRUD API endpoints.

Author : Coke
Date   : 2026-05-13
"""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from rapidkit_common.auth import VerifyPermissionDep
from rapidkit_common.deps import SessionDep
from rapidkit_common.schemas.response import PaginatedResponse, Response

from plugin_permission.field_guard.crud import FieldPolicyCRUD
from plugin_permission.field_guard.schemas import (
    FieldPolicyCreate,
    FieldPolicyListQuery,
    FieldPolicyResponse,
    FieldPolicyUpdate,
)

router = APIRouter(prefix="/field-policies", tags=["field-policies"])


async def get_crud(session: SessionDep) -> FieldPolicyCRUD:
    return FieldPolicyCRUD(session)


@router.get("")
async def list_field_policies(
    _: VerifyPermissionDep,
    query: Annotated[FieldPolicyListQuery, Query(...)],
    crud: FieldPolicyCRUD = Depends(get_crud),
) -> Response[PaginatedResponse[FieldPolicyResponse]]:
    result = await crud.get_paginate(page=query.page, size=query.page_size, schema=FieldPolicyResponse)
    return Response(data=result)


@router.get("/all")
async def get_all_field_policies(
    crud: FieldPolicyCRUD = Depends(get_crud),
) -> Response[list[FieldPolicyResponse]]:
    """获取全部字段策略（不分页，用于角色分配下拉）。"""
    policies = await crud.get_all(schema=FieldPolicyResponse)
    return Response(data=policies)


@router.post("")
async def create_field_policy(
    _: VerifyPermissionDep,
    body: FieldPolicyCreate,
    crud: FieldPolicyCRUD = Depends(get_crud),
) -> Response[FieldPolicyResponse]:
    item = await crud.create(body.model_dump())
    return Response(data=FieldPolicyResponse.model_validate(item))


@router.put("/{policy_id}")
async def update_field_policy(
    _: VerifyPermissionDep,
    policy_id: UUID,
    body: FieldPolicyUpdate,
    crud: FieldPolicyCRUD = Depends(get_crud),
) -> Response[FieldPolicyResponse]:
    item = await crud.update_by_id(policy_id, body.model_dump(exclude_unset=True))
    return Response(data=FieldPolicyResponse.model_validate(item))


@router.delete("/{policy_id}")
async def delete_field_policy(
    _: VerifyPermissionDep,
    policy_id: UUID,
    crud: FieldPolicyCRUD = Depends(get_crud),
) -> Response[None]:
    await crud.delete(policy_id)
    return Response(data=None)
