"""
审计字典 API 路由。

Author : Coke
Date   : 2026-04-20
"""

from uuid import UUID

from fastapi import APIRouter, Depends
from rapidkit_common.auth import verify_user_permission
from rapidkit_common.schemas.response import Response

from plugin_system.audit_dict.deps import AuditDictCrudDep
from plugin_system.audit_dict.schemas import AuditDictCreate, AuditDictResponse, AuditDictUpdate

router = APIRouter(
    prefix="/audit-dict",
    tags=["AuditDictionary"],
)


@router.get("", summary="获取所有审计字典")
async def get_all_audit_dict(crud: AuditDictCrudDep) -> Response[list[AuditDictResponse]]:
    """获取所有审计字典条目（前端启动时拉取）。"""
    items = await crud.get_all()
    data = [AuditDictResponse.model_validate(item) for item in items]
    return Response(data=data)


@router.post(
    "",
    summary="新增审计字典",
    dependencies=[Depends(verify_user_permission)],
)
async def create_audit_dict(
    body: AuditDictCreate,
    crud: AuditDictCrudDep,
) -> Response[AuditDictResponse]:
    """新增审计字典条目。"""
    item = await crud.create(body)
    return Response(data=AuditDictResponse.model_validate(item))


@router.put(
    "/{item_id}",
    summary="修改审计字典",
    dependencies=[Depends(verify_user_permission)],
)
async def update_audit_dict(
    item_id: UUID,
    body: AuditDictUpdate,
    crud: AuditDictCrudDep,
) -> Response[AuditDictResponse]:
    """修改审计字典条目。"""
    item = await crud.update_by_id(item_id, body)
    return Response(data=AuditDictResponse.model_validate(item))


@router.delete(
    "/{item_id}",
    summary="删除审计字典",
    dependencies=[Depends(verify_user_permission)],
)
async def delete_audit_dict(
    item_id: UUID,
    crud: AuditDictCrudDep,
) -> Response[bool]:
    """删除审计字典条目。"""
    await crud.delete(item_id)
    return Response(data=True)
