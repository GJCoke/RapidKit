"""
Database(SQLModel) CRUD base class.

Provides generic async CRUD operations with session-lifecycle transaction management.
CRUD methods only flush — commit/rollback is handled by the caller (FastAPI deps or async with).

Author : Coke
Date   : 2025-03-18
"""

from typing import Any, ClassVar, Generic, Literal, Sequence, TypeVar, overload
from uuid import UUID

from pydantic import BaseModel as PydanticBaseModel
from rapidkit_framework.exceptions import AppException
from rapidkit_framework.status_codes import StatusCode
from sqlalchemy import ColumnExpressionArgument
from sqlalchemy.exc import IntegrityError
from sqlmodel import col, delete, func, select, update
from sqlmodel.ext.asyncio.session import AsyncSession

from rapidkit_common.models import SQLModel as _SQLModel
from rapidkit_common.schemas.response import CursorPaginatedResponse, PaginatedResponse

Model = TypeVar("Model", bound=_SQLModel)
T = TypeVar("T", bound=PydanticBaseModel)


class BaseCRUD(Generic[Model]):
    """
    泛型 CRUD 基类。

    子类必须声明 ``model`` 类变量。构造函数仅接收 session，
    事务由 session 生命周期管理（FastAPI deps 或 async with）。

    Example::

        class RoleCRUD(BaseCRUD[Role]):
            model = Role
    """

    model: ClassVar[type[_SQLModel]]  # type: ignore[misc]

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    # ==================== 查询 ====================

    def select(self, *filters: ColumnExpressionArgument[bool]):
        """返回带过滤条件的 select statement，供子类构建复杂查询。"""
        return select(self.model).filter(*filters)

    @overload
    async def get(
        self,
        id: UUID,
        /,
        *,
        nullable: Literal[False],
        schema: type[T],
    ) -> T: ...

    @overload
    async def get(
        self,
        id: UUID,
        /,
        *,
        nullable: Literal[False],
        schema: None = None,
    ) -> Model: ...

    @overload
    async def get(
        self,
        id: UUID,
        /,
        *,
        nullable: Literal[True] = True,
        schema: type[T],
    ) -> T | None: ...

    @overload
    async def get(
        self,
        id: UUID,
        /,
        *,
        nullable: Literal[True] = True,
        schema: None = None,
    ) -> Model | None: ...

    async def get(
        self,
        id: UUID,
        /,
        *,
        nullable: bool = True,
        schema: type[T] | None = None,
    ) -> Model | T | None:
        """
        按主键查询单条记录。

        Args:
            id: 主键。
            nullable: False 时未找到抛出 RESOURCE_NOT_FOUND。
            schema: 可选 Pydantic 模型类，传入时返回序列化结果。
        """
        statement = select(self.model).filter(col(self.model.id) == id)
        result = await self.session.exec(statement)
        record = result.first()

        if not nullable and not record:
            raise AppException(StatusCode.RESOURCE_NOT_FOUND)

        if record is not None and schema is not None:
            return schema.model_validate(record)
        return record  # ty: ignore[invalid-return-type]

    @overload
    async def get_by_ids(
        self,
        ids: list[UUID],
        *,
        order_by: Any | None = None,
        schema: type[T],
    ) -> list[T]: ...

    @overload
    async def get_by_ids(
        self,
        ids: list[UUID],
        *,
        order_by: Any | None = None,
        schema: None = None,
    ) -> list[Model]: ...

    async def get_by_ids(
        self,
        ids: list[UUID],
        *,
        order_by: Any | None = None,
        schema: type[T] | None = None,
    ) -> list[Model] | list[T]:
        """按主键列表批量查询。"""
        if not ids:
            raise AppException(StatusCode.MISSING_REQUIRED_FIELD)

        statement = select(self.model).filter(col(self.model.id).in_(ids))
        if order_by is not None:
            statement = statement.order_by(order_by)
        result = await self.session.exec(statement)
        records = list(result.all())

        if schema is not None:
            return [schema.model_validate(item) for item in records]
        return records

    @overload
    async def get_all(
        self,
        *filters: ColumnExpressionArgument[bool],
        order_by: Any | None = None,
        schema: type[T],
    ) -> list[T]: ...

    @overload
    async def get_all(
        self,
        *filters: ColumnExpressionArgument[bool],
        order_by: Any | None = None,
        schema: None = None,
    ) -> list[Model]: ...

    async def get_all(
        self,
        *filters: ColumnExpressionArgument[bool],
        order_by: Any | None = None,
        schema: type[T] | None = None,
    ) -> list[Model] | list[T]:
        """条件查询全部记录。"""
        statement = select(self.model).filter(*filters)
        if order_by is not None:
            statement = statement.order_by(order_by)
        result = await self.session.exec(statement)
        records = list(result.all())

        if schema is not None:
            return [schema.model_validate(item) for item in records]
        return records

    async def get_count(self, *filters: ColumnExpressionArgument[bool]) -> int:
        """条件计数。"""
        statement = select(func.count()).select_from(self.model).filter(*filters)
        result = await self.session.exec(statement)
        return result.one()

    @overload
    async def get_paginate(
        self,
        *filters: ColumnExpressionArgument[bool],
        page: int = 1,
        size: int = 20,
        order_by: Any | None = None,
        schema: type[T],
    ) -> PaginatedResponse[T]: ...

    @overload
    async def get_paginate(
        self,
        *filters: ColumnExpressionArgument[bool],
        page: int = 1,
        size: int = 20,
        order_by: Any | None = None,
        schema: None = None,
    ) -> PaginatedResponse[Model]: ...

    async def get_paginate(
        self,
        *filters: ColumnExpressionArgument[bool],
        page: int = 1,
        size: int = 20,
        order_by: Any | None = None,
        schema: type[T] | None = None,
    ) -> PaginatedResponse[Model] | PaginatedResponse[T]:
        """偏移量分页，使用 COUNT(*) OVER() 窗口函数单次查询。"""
        total_col = func.count().over().label("_total")
        statement = select(self.model, total_col).filter(*filters).offset((page - 1) * size).limit(size)
        if order_by is not None:
            statement = statement.order_by(order_by)

        rows = (await self.session.exec(statement)).all()  # type: ignore[arg-type]

        if rows:
            records = [row[0] for row in rows]
            total: int = rows[0][1]
        else:
            records = []
            total = 0

        if schema is not None:
            return PaginatedResponse(
                records=[schema.model_validate(item) for item in records],
                total=total,
                page=page,
                page_size=size,
            )
        return PaginatedResponse(records=records, total=total, page=page, page_size=size)

    async def get_paginate_by_cursor(
        self,
        *filters: ColumnExpressionArgument[bool],
        cursor: UUID | None = None,
        size: int = 20,
        order_by: Any | None = None,
        schema: type[T] | None = None,
    ) -> CursorPaginatedResponse[Model] | CursorPaginatedResponse[T]:
        """
        游标分页。基于主键 id 排序，cursor 为上一页最后一条的 id。

        请求 size+1 条以判断是否有下一页。
        """
        statement = select(self.model).filter(*filters)

        if cursor is not None:
            statement = statement.filter(col(self.model.id) > cursor)

        if order_by is not None:
            statement = statement.order_by(order_by)
        else:
            statement = statement.order_by(col(self.model.id))

        statement = statement.limit(size + 1)
        result = await self.session.exec(statement)
        records = list(result.all())

        has_next = len(records) > size
        if has_next:
            records = records[:size]

        next_cursor = records[-1].id if has_next and records else None  # type: ignore[union-attr]

        if schema is not None:
            return CursorPaginatedResponse(
                items=[schema.model_validate(item) for item in records],
                next_cursor=next_cursor,
                size=size,
            )
        return CursorPaginatedResponse(items=records, next_cursor=next_cursor, size=size)

    async def exists(self, *filters: ColumnExpressionArgument[bool]) -> bool:
        """存在性检查，使用 SELECT 1 ... LIMIT 1。"""
        statement = select(func.literal(1)).select_from(self.model).filter(*filters).limit(1)
        result = await self.session.exec(statement)  # type: ignore[arg-type]
        return result.first() is not None

    # ==================== 写入 ====================

    async def create(self, data: dict[str, Any] | PydanticBaseModel) -> Model:
        """
        创建单条记录。

        model_validate(data) → begin_nested → add + flush → refresh → 返回。
        """
        record = self.model.model_validate(data)
        try:
            async with self.session.begin_nested():
                self.session.add(record)
                await self.session.flush()
        except IntegrityError:
            raise AppException(StatusCode.ALREADY_EXISTS)
        await self.session.refresh(record)
        return record  # ty: ignore[invalid-return-type]

    async def create_all(self, data: Sequence[dict[str, Any] | PydanticBaseModel]) -> list[Model]:
        """批量创建，返回创建的记录列表。"""
        if not data:
            raise AppException(StatusCode.MISSING_REQUIRED_FIELD)

        records = [self.model.model_validate(item) for item in data]
        try:
            async with self.session.begin_nested():
                self.session.add_all(records)
                await self.session.flush()
        except IntegrityError:
            raise AppException(StatusCode.ALREADY_EXISTS)
        return records  # ty: ignore[invalid-return-type]

    async def update_by_id(self, id: UUID, data: dict[str, Any] | PydanticBaseModel) -> Model:
        """按主键更新。仅更新 data 中显式设置的字段。"""
        record = await self.get(id, nullable=False)

        if not isinstance(data, dict):
            data = data.model_dump(exclude_unset=True)

        for field, value in data.items():
            setattr(record, field, value)

        try:
            async with self.session.begin_nested():
                self.session.add(record)
                await self.session.flush()
        except IntegrityError:
            raise AppException(StatusCode.ALREADY_EXISTS)
        await self.session.refresh(record)
        return record

    async def update_all(self, updates: list[dict[str, Any]]) -> None:
        """
        ORM 批量 UPDATE。每条 dict 必须含 id 字段。

        先校验所有 id 存在，再执行批量 update。
        """
        if not updates:
            raise AppException(StatusCode.MISSING_REQUIRED_FIELD)

        ids: list[UUID] = []
        for item in updates:
            _id = item.get("id")
            if not _id:
                raise AppException(StatusCode.MISSING_REQUIRED_FIELD)
            ids.append(_id)

        result = await self.session.exec(
            select(func.count()).select_from(self.model).where(col(self.model.id).in_(ids))
        )
        if result.one() != len(ids):
            raise AppException(StatusCode.RESOURCE_NOT_FOUND)

        try:
            async with self.session.begin_nested():
                await self.session.exec(update(self.model), params=updates)  # type: ignore[call-overload]
        except IntegrityError:
            raise AppException(StatusCode.ALREADY_EXISTS)

    async def delete(self, id: UUID, /) -> Model:
        """按主键删除，返回被删除的记录。"""
        record = await self.get(id, nullable=False)
        await self.session.delete(record)
        await self.session.flush()
        return record

    async def delete_all(self, ids: list[UUID], /) -> None:
        """批量删除。"""
        if not ids:
            raise AppException(StatusCode.MISSING_REQUIRED_FIELD)

        statement = delete(self.model).filter(col(self.model.id).in_(ids))
        await self.session.exec(statement)
        await self.session.flush()
