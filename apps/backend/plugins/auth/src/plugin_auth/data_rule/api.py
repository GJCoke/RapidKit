"""
数据规则管理 API。

Author : Coke
Date   : 2026-04-20
"""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from rapidkit_common.auth import verify_user_permission
from rapidkit_common.schemas.request import PaginatedRequest
from rapidkit_common.schemas.response import PaginatedResponse, Response

from plugin_auth.data_rule.deps import DataRuleCrudDep
from plugin_auth.data_rule.schemas import DataRuleCreate, DataRuleResponse, DataRuleUpdate

router = APIRouter(
    prefix="/data-rules",
    tags=["DataRule"],
    dependencies=[Depends(verify_user_permission)],
)


@router.get("/all", summary="全部数据规则")
async def get_all_data_rules(crud: DataRuleCrudDep) -> Response[list[DataRuleResponse]]:
    """获取全部数据规则（不分页，用于下拉选项）。"""
    rules = await crud.get_all(schema=DataRuleResponse)
    return Response(data=rules)


@router.get("", summary="数据规则分页列表")
async def get_data_rules(
    query: Annotated[PaginatedRequest, Query(...)],
    crud: DataRuleCrudDep,
) -> Response[PaginatedResponse[DataRuleResponse]]:
    """分页查询数据规则。"""
    result = await crud.get_paginate(page=query.page, size=query.page_size, schema=DataRuleResponse)
    return Response(data=result)


@router.post("", summary="创建数据规则")
async def create_data_rule(body: DataRuleCreate, crud: DataRuleCrudDep) -> Response[DataRuleResponse]:
    """创建新数据规则。"""
    rule = await crud.create(body)
    return Response(data=DataRuleResponse.model_validate(rule))


@router.put("/{rule_id}", summary="更新数据规则")
async def update_data_rule(rule_id: UUID, body: DataRuleUpdate, crud: DataRuleCrudDep) -> Response[DataRuleResponse]:
    """更新数据规则。"""
    rule = await crud.update_by_id(rule_id, body.model_dump(exclude_unset=True))
    return Response(data=DataRuleResponse.model_validate(rule))


@router.delete("/{rule_id}", summary="删除数据规则")
async def delete_data_rule(rule_id: UUID, crud: DataRuleCrudDep) -> Response[DataRuleResponse]:
    """删除数据规则。"""
    rule = await crud.delete(rule_id)
    return Response(data=DataRuleResponse.model_validate(rule))
