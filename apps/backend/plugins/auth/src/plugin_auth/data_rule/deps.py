"""
数据规则依赖项。

Author : Coke
Date   : 2026-04-20
"""

from fastapi import Depends
from rapidkit_common.data_scope import build_data_filter
from rapidkit_common.deps import RedisDep, SessionDep
from rapidkit_common.enums import DataScope
from rapidkit_common.models import SQLModel
from sqlalchemy import ColumnElement
from sqlmodel import or_, true
from typing_extensions import Annotated, Doc

from plugin_auth.auth.deps import UserDBDep
from plugin_auth.data_rule.crud import DataRuleCRUD
from plugin_auth.role.deps import RoleCrudDep, get_user_permission_cache


async def get_data_rule_crud(session: SessionDep) -> DataRuleCRUD:
    """提供 DataRuleCRUD 实例。"""
    return DataRuleCRUD(session)


DataRuleCrudDep = Annotated[
    DataRuleCRUD,
    Depends(get_data_rule_crud),
    Doc("依赖项：提供 DataRuleCRUD 实例。"),
]


class DataPermissionFilter:
    """
    数据权限过滤器，作为 FastAPI Depends 使用。

    用法::

        @router.get("")
        async def get_items(
            data_filter: Annotated[ColumnElement[bool], Depends(DataPermissionFilter(MyModel))],
        ):
            items = await crud.get_paginate(data_filter, ...)
    """

    def __init__(self, *models: type[SQLModel]) -> None:
        self.models = models

    async def __call__(
        self,
        user: UserDBDep,
        redis: RedisDep,
        role_crud: RoleCrudDep,
        session: SessionDep,
    ) -> ColumnElement[bool]:
        if user.is_admin:
            return or_(true())

        cache = await get_user_permission_cache(user, redis, role_crud)

        if cache.data_scope == DataScope.ALL:
            return or_(true())

        return await build_data_filter(
            user=user,
            session=session,
            models=self.models,
            data_scope=DataScope(cache.data_scope),
            custom_dept_ids=cache.custom_dept_ids,
            data_rule_ids=cache.data_rule_ids,
        )
