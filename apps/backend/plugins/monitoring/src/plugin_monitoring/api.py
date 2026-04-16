"""
API 监控路由。

提供 API 维度的监控数据查询端点。

Author : Coke
Date   : 2026-04-13
"""

from typing import Annotated

from fastapi import APIRouter, Depends, Query
from rapidkit_common.auth import verify_user_permission
from rapidkit_common.deps import SessionDep
from rapidkit_common.schemas.response import PaginatedResponse, Response

from plugin_monitoring.schemas import (
    ApiDistributionItem,
    ApiListItem,
    ApiListQuery,
    ApiOverviewResponse,
    ApiTopItem,
    ApiTopQuery,
    ApiTrendPoint,
    TimeRangeQuery,
)
from plugin_monitoring.services import get_distribution, get_list, get_overview, get_top, get_trend

router = APIRouter(
    prefix="/system",
    tags=["System"],
    dependencies=[Depends(verify_user_permission)],
)


@router.get("/stats/api/overview", summary="API 监控概览")
async def get_api_overview(
    session: SessionDep,
    query: Annotated[TimeRangeQuery, Query(...)],
) -> Response[ApiOverviewResponse]:
    """获取总请求数、总失败数、平均错误率、最忙接口。"""
    data = await get_overview(session, range_str=query.range, start=query.start, end=query.end)
    return Response(data=data)


@router.get("/stats/api/top", summary="API Top N 排行")
async def get_api_top(
    session: SessionDep,
    query: Annotated[ApiTopQuery, Query(...)],
) -> Response[list[ApiTopItem]]:
    """按请求量/失败量/响应时间排序的 Top N。"""
    data = await get_top(
        session, range_str=query.range, start=query.start, end=query.end, sort_by=query.sort_by, limit=query.limit
    )
    return Response(data=data)


@router.get("/stats/api/distribution", summary="API 请求占比分布")
async def get_api_distribution(
    session: SessionDep,
    query: Annotated[TimeRangeQuery, Query(...)],
) -> Response[list[ApiDistributionItem]]:
    """获取请求占比（Top 8 + 其他），用于饼图。"""
    data = await get_distribution(session, range_str=query.range, start=query.start, end=query.end)
    return Response(data=data)


@router.get("/stats/api/trend", summary="API 请求量趋势")
async def get_api_trend(
    session: SessionDep,
    query: Annotated[TimeRangeQuery, Query(...)],
) -> Response[list[ApiTrendPoint]]:
    """获取按小时的请求量/失败量趋势数据。"""
    data = await get_trend(session, range_str=query.range, start=query.start, end=query.end)
    return Response(data=data)


@router.get("/stats/api/list", summary="API 明细列表")
async def get_api_list(
    session: SessionDep,
    query: Annotated[ApiListQuery, Query(...)],
) -> Response[PaginatedResponse[ApiListItem]]:
    """获取 API 明细分页列表，支持搜索和排序。"""
    result = await get_list(
        session,
        range_str=query.range,
        start=query.start,
        end=query.end,
        keyword=query.keyword,
        page=query.page,
        page_size=query.page_size,
        sort_by=query.sort_by,
        sort_order=query.sort_order,
    )
    return Response(data=PaginatedResponse(**result))
