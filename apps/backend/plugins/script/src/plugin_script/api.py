"""
Script domain API.

Author  : Coke
Date    : 2026-03-31
"""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from rapidkit_common.auth import UserDBDep, verify_user_permission
from rapidkit_common.schemas.response import PaginatedResponse, Response
from sqlmodel import col

from plugin_script.deps import ScriptCrudDep, ScriptExecCrudDep
from plugin_script.models import ScriptExecution
from plugin_script.schemas import (
    ScriptBatchBody,
    ScriptCreate,
    ScriptExecuteResponse,
    ScriptExecutionPageQuery,
    ScriptExecutionResponse,
    ScriptListResponse,
    ScriptPageQuery,
    ScriptResponse,
    ScriptUpdate,
)
from plugin_script.services import execute_code, filter_script

router = APIRouter(
    prefix="/scripts",
    tags=["Script"],
    dependencies=[Depends(verify_user_permission)],
)


@router.get("")
async def get_scripts(
    query: Annotated[ScriptPageQuery, Query(...)],
    script_crud: ScriptCrudDep,
) -> Response[PaginatedResponse[ScriptListResponse]]:
    """获取分页的脚本列表。"""
    filters = filter_script(query.status, query.language, query.keyword)
    scripts = await script_crud.get_paginate(
        *filters,
        page=query.page,
        size=query.page_size,
        serializer=ScriptListResponse,
    )
    return Response(data=scripts)


@router.get("/{script_id}")
async def get_script(
    script_id: UUID,
    script_crud: ScriptCrudDep,
) -> Response[ScriptResponse]:
    """获取脚本详情（含 code）。"""
    script = await script_crud.get(script_id)
    return Response(data=ScriptResponse.model_validate(script))


@router.post("")
async def create_script(
    body: ScriptCreate,
    script_crud: ScriptCrudDep,
) -> Response[ScriptResponse]:
    """创建脚本。"""
    script = await script_crud.create(body)
    return Response(data=ScriptResponse.model_validate(script))


@router.put("/{script_id}")
async def update_script(
    script_id: UUID,
    body: ScriptUpdate,
    script_crud: ScriptCrudDep,
) -> Response[ScriptResponse]:
    """更新脚本。"""
    script = await script_crud.update_by_id(script_id, body)
    return Response(data=ScriptResponse.model_validate(script))


@router.delete("")
async def batch_delete_scripts(
    query: ScriptBatchBody,
    script_crud: ScriptCrudDep,
) -> Response[bool]:
    """批量删除脚本。"""
    await script_crud.delete_all(query.ids)
    return Response(data=True)


@router.delete("/{script_id}")
async def delete_script(
    script_id: UUID,
    script_crud: ScriptCrudDep,
) -> Response[bool]:
    """删除单个脚本。"""
    await script_crud.delete(script_id)
    return Response(data=True)


@router.post("/{script_id}/execute")
async def execute_script(
    script_id: UUID,
    user: UserDBDep,
    script_crud: ScriptCrudDep,
    exec_crud: ScriptExecCrudDep,
) -> Response[ScriptExecuteResponse]:
    """执行脚本并记录审计日志。"""
    script = await script_crud.get(script_id, nullable=False)
    result = await execute_code(script.language, script.code)

    await exec_crud.create(
        {
            "script_id": script.id,
            "executor_id": user.id,
            "language": script.language,
            "code": script.code,
            "stdout": result["stdout"],
            "stderr": result["stderr"],
            "exit_code": result["exit_code"],
            "runtime": result["runtime"],
        }
    )

    return Response(data=ScriptExecuteResponse(**result))


@router.get("/{script_id}/executions")
async def get_script_executions(
    script_id: UUID,
    query: Annotated[ScriptExecutionPageQuery, Query(...)],
    exec_crud: ScriptExecCrudDep,
) -> Response[PaginatedResponse[ScriptExecutionResponse]]:
    """获取脚本执行历史（分页）。"""
    executions = await exec_crud.get_paginate(
        col(ScriptExecution.script_id) == script_id,
        page=query.page,
        size=query.page_size,
        serializer=ScriptExecutionResponse,
    )
    return Response(data=executions)
