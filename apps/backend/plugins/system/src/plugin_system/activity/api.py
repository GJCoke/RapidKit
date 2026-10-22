from typing import Annotated

from fastapi import APIRouter, Query
from rapidkit_common.access import Require
from rapidkit_common.schemas.response import CursorPaginatedResponse, Response

from plugin_system.activity.deps import ActivityEventCrudDep
from plugin_system.activity.schemas import ActivityCursorQuery, ActivityResponse

router = APIRouter(
    prefix="/system",
    tags=["System"],
)


@router.get("/activities", summary="最近系统活动", dependencies=[Require("dashboard:activity")])
async def get_activities(
    query: Annotated[ActivityCursorQuery, Query(...)],
    crud: ActivityEventCrudDep,
) -> Response[CursorPaginatedResponse[ActivityResponse]]:
    """使用游标分页返回纳入首页展示范围的系统活动。"""
    data = await crud.get_cursor_page(
        categories=query.categories,
        levels=query.levels,
        cursor=query.cursor,
        size=query.size,
    )
    return Response(data=data)
