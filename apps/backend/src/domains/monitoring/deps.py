"""
API 监控领域依赖项。

Author : Coke
Date   : 2026-04-13
"""

from fastapi import Depends
from typing_extensions import Annotated, Doc

from src.common.deps import RedisDep, SessionDep
from src.domains.monitoring.services import ApiMetricsService


async def get_api_metrics_service(redis: RedisDep, session: SessionDep) -> ApiMetricsService:
    """提供 ApiMetricsService 实例。"""
    return ApiMetricsService(redis=redis, session=session)


ApiMetricsServiceDep = Annotated[
    ApiMetricsService,
    Depends(get_api_metrics_service),
    Doc("依赖项：提供 ApiMetricsService 实例，用于 API 监控指标查询。"),
]
