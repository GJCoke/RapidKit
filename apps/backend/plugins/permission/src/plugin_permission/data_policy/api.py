"""
DataPolicy management API.

Author : Coke
Date   : 2026-04-30
"""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from rapidkit_common.auth import UserDBDep, verify_user_permission
from rapidkit_common.deps import RedisDep, SessionDep
from rapidkit_common.schemas.response import PaginatedResponse, Response
from rapidkit_common.transaction import after_commit
from rapidkit_core.log import get_plugin_logger
from rapidkit_framework.exceptions import AppException
from rapidkit_framework.status_codes import StatusCode
from sqlmodel import col

from plugin_permission.data_policy.deps import DataPolicyCrudDep
from plugin_permission.data_policy.schemas import (
    DataPolicyCreate,
    DataPolicyPageQuery,
    DataPolicyResponse,
    DataPolicyUpdate,
    PolicySimulateRequest,
    PolicySimulateResponse,
)
from plugin_permission.data_policy.services import (
    get_all_template_vars,
    get_model_metadata,
    invalidate_policy_cache,
    remove_policy_from_roles,
    validate_policy_semantics,
)
from plugin_permission.data_policy.simulator import simulate_policies
from plugin_permission.models import DataPolicy
from plugin_permission.status_codes import RbacStatusCode

logger = get_plugin_logger("Permission")

router = APIRouter(
    prefix="/data-policies",
    tags=["DataPolicy"],
    dependencies=[Depends(verify_user_permission)],
)


@router.get("/models", summary="可用模型元数据")
async def get_models() -> Response[list[dict]]:
    """获取所有已注册模型及其字段信息。"""
    return Response(data=get_model_metadata())


@router.get("/template-vars", summary="可用模板变量列表")
async def get_template_vars() -> Response[list[dict]]:
    """获取所有可用的模板变量（内置 + 插件注册）。"""
    return Response(data=get_all_template_vars())


@router.get("/all", summary="全部数据策略")
async def get_all_policies(crud: DataPolicyCrudDep) -> Response[list[DataPolicyResponse]]:
    """获取全部数据策略（不分页，用于下拉选项）。"""

    policies = await crud.get_all(order_by=col(DataPolicy.create_time).desc(), schema=DataPolicyResponse)
    return Response(data=policies)


@router.get("", summary="数据策略分页列表")
async def get_policies(
    query: Annotated[DataPolicyPageQuery, Query(...)],
    crud: DataPolicyCrudDep,
) -> Response[PaginatedResponse[DataPolicyResponse]]:
    """分页查询数据策略。"""

    filters = []
    if query.keyword:
        filters.append(col(DataPolicy.name).contains(query.keyword))
    result = await crud.get_paginate(
        *filters,
        page=query.page,
        size=query.page_size,
        order_by=col(DataPolicy.create_time).desc(),
        schema=DataPolicyResponse,
    )
    return Response(data=result)


@router.post("", summary="创建数据策略")
async def create_policy(body: DataPolicyCreate, crud: DataPolicyCrudDep) -> Response[DataPolicyResponse]:
    """创建新数据策略。"""
    semantic_errors = validate_policy_semantics(body.rule, body.target_model)
    if semantic_errors:
        raise AppException(StatusCode.VALIDATION_ERROR, data=semantic_errors)

    policy = await crud.create(body)
    logger.info("DataPolicy created: {name}", name=body.name)
    return Response(data=DataPolicyResponse.model_validate(policy))


@router.put("/{policy_id}", summary="更新数据策略")
async def update_policy(
    policy_id: UUID,
    body: DataPolicyUpdate,
    crud: DataPolicyCrudDep,
    redis: RedisDep,
    session: SessionDep,
) -> Response[DataPolicyResponse]:
    """更新数据策略。"""
    if body.rule is not None or body.target_model is not None:
        current = await crud.get(policy_id, nullable=False)
        check_rule = body.rule if body.rule is not None else current.rule
        check_model = body.target_model if body.target_model is not None else current.target_model
        semantic_errors = validate_policy_semantics(check_rule, check_model)
        if semantic_errors:
            raise AppException(StatusCode.VALIDATION_ERROR, data=semantic_errors)

    policy = await crud.update_by_id(policy_id, body.model_dump(exclude_unset=True))
    after_commit(session, invalidate_policy_cache, redis, policy_id)
    logger.info("DataPolicy updated: {policy_id}", policy_id=policy_id)
    return Response(data=DataPolicyResponse.model_validate(policy))


@router.delete("/{policy_id}", summary="删除数据策略")
async def delete_policy(
    policy_id: UUID,
    crud: DataPolicyCrudDep,
    redis: RedisDep,
    session: SessionDep,
) -> Response[DataPolicyResponse]:
    """删除数据策略。"""
    policy = await crud.delete(policy_id)
    await remove_policy_from_roles(policy_id, session)
    after_commit(session, invalidate_policy_cache, redis, policy_id)
    logger.info("DataPolicy deleted: {policy_id}", policy_id=policy_id)
    return Response(data=DataPolicyResponse.model_validate(policy))


@router.post("/simulate", summary="策略模拟")
async def simulate_policy(
    body: PolicySimulateRequest,
    user: UserDBDep,
    session: SessionDep,
) -> Response[PolicySimulateResponse]:
    """模拟策略执行，仅管理员可用。"""
    if not user.is_admin:
        raise AppException(RbacStatusCode.ROLE_PERMISSION_DENIED)
    result = await simulate_policies(body, session)
    return Response(data=result)
