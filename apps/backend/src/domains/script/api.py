"""
Script domain API.

Author  : Claude
Date    : 2026-03-31
"""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlmodel import col

from src.common.schemas.response import PaginatedResponse, Response
from src.domains.auth.deps import UserDBDep
from src.domains.role.deps import verify_user_permission
from src.domains.script.deps import ScriptCrudDep, ScriptExecCrudDep
from src.domains.script.models import ScriptExecution
from src.domains.script.schemas import (
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
from src.domains.script.services import execute_code, filter_script

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
    """
    获取分页的脚本列表。\f

    Args:
        query: 查询参数。
        script_crud: 脚本 CRUD 依赖。

    Returns:
        分页的脚本数据（不含 code 大字段）。
    """
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
    """
    获取脚本详情（含 code）。\f

    Args:
        script_id: 脚本 ID。
        script_crud: 脚本 CRUD 依赖。

    Returns:
        脚本详情。
    """
    script = await script_crud.get(script_id)
    return Response(data=ScriptResponse.model_validate(script))


@router.post("")
async def create_script(
    body: ScriptCreate,
    script_crud: ScriptCrudDep,
) -> Response[ScriptResponse]:
    """
    创建脚本。\f

    Args:
        body: 创建数据。
        script_crud: 脚本 CRUD 依赖。

    Returns:
        新创建的脚本。
    """
    script = await script_crud.create(body)
    return Response(data=ScriptResponse.model_validate(script))


@router.put("/{script_id}")
async def update_script(
    script_id: UUID,
    body: ScriptUpdate,
    script_crud: ScriptCrudDep,
) -> Response[ScriptResponse]:
    """
    更新脚本。\f

    Args:
        script_id: 脚本 ID。
        body: 更新数据。
        script_crud: 脚本 CRUD 依赖。

    Returns:
        更新后的脚本。
    """
    script = await script_crud.update_by_id(script_id, body)
    return Response(data=ScriptResponse.model_validate(script))


@router.delete("")
async def batch_delete_scripts(
    query: ScriptBatchBody,
    script_crud: ScriptCrudDep,
) -> Response[bool]:
    """
    批量删除脚本。\f

    Args:
        query: 包含要删除的脚本 ID 列表。
        script_crud: 脚本 CRUD 依赖。

    Returns:
        删除成功则为 True。
    """
    await script_crud.delete_all(query.ids)
    return Response(data=True)


@router.delete("/{script_id}")
async def delete_script(
    script_id: UUID,
    script_crud: ScriptCrudDep,
) -> Response[bool]:
    """
    删除单个脚本。\f

    Args:
        script_id: 脚本 ID。
        script_crud: 脚本 CRUD 依赖。

    Returns:
        删除成功则为 True。
    """
    await script_crud.delete(script_id)
    return Response(data=True)


@router.post("/{script_id}/execute")
async def execute_script(
    script_id: UUID,
    user: UserDBDep,
    script_crud: ScriptCrudDep,
    exec_crud: ScriptExecCrudDep,
) -> Response[ScriptExecuteResponse]:
    """
    执行脚本并记录审计日志。\f

    Args:
        script_id: 脚本 ID。
        user: 当前登录用户。
        script_crud: 脚本 CRUD 依赖。
        exec_crud: 执行记录 CRUD 依赖。

    Returns:
        脚本执行结果。
    """
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
    """
    获取脚本执行历史（分页）。\f

    Args:
        script_id: 脚本 ID。
        query: 分页查询参数。
        exec_crud: 执行记录 CRUD 依赖。

    Returns:
        分页的执行历史记录。
    """
    executions = await exec_crud.get_paginate(
        col(ScriptExecution.script_id) == script_id,
        page=query.page,
        size=query.page_size,
        serializer=ScriptExecutionResponse,
    )
    return Response(data=executions)
