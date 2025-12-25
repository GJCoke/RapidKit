"""
Database(SQLModel) create, read, update, delete operations.

This file contains the base CRUD operations for handling database queries.

Author : Coke
Date   : 2025-03-18
"""

from typing import Any, Generic, Literal, Sequence, TypeVar, cast, overload
from uuid import UUID

from pydantic import BaseModel as PydanticBaseModel
from sqlalchemy import ColumnExpressionArgument
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.sql import ColumnElement
from sqlmodel import col, delete, func, select, update
from sqlmodel.ext.asyncio.session import AsyncSession

from src.core.exceptions import AppException
from src.core.status_codes import StatusCode
from src.models.base import SQLModel as _SQLModel
from src.schemas.base import BaseModel
from src.schemas.response import PaginatedResponse

SQLModel = TypeVar("SQLModel", bound=_SQLModel)
CreateSchema = TypeVar("CreateSchema", bound=BaseModel)
UpdateSchema = TypeVar("UpdateSchema", bound=BaseModel)
_PydanticBaseModel = TypeVar("_PydanticBaseModel", bound=PydanticBaseModel)


class BaseSQLModelCRUD(Generic[SQLModel, CreateSchema, UpdateSchema]):
    """
    基于 SQLAlchemy 的 SQLModel 通用 CRUD 操作基类。

    提供 SQLModel 模型的通用增删改查操作。
    """

    def __init__(self, model: type[SQLModel], *, session: AsyncSession | None = None, auto_commit: bool = True) -> None:
        """
        初始化 BaseSQLModelCRUD。

        Args:
            model: CRUD 操作对应的 SQLModel 类。
            session: 用于 CRUD 操作的 SQLAlchemy 会话。
            auto_commit: 是否自动提交更改。
        """

        self._model = model
        self._session = session
        self.auto_commit = auto_commit

    @property
    def model(self) -> type[SQLModel]:
        """
        获取当前 CRUD 操作的模型类。

        Returns:
            type[SQLModel]: 当前使用的模型类。
        """

        return self._model

    @property
    def session(self) -> AsyncSession:
        """
        获取全局会话。

        Returns:
            AsyncSession: SQLAlchemy 异步会话。

        Raises:
            RuntimeError: 会话未初始化时抛出。
        """
        if self._session is None:
            raise RuntimeError("Session is not initialized.")
        return self._session

    async def commit(self, auto_commit: bool = True) -> None:
        """
        提交当前事务。

        Args:
            auto_commit: 是否自动提交事务，默认 True。
        """
        auto_commit = auto_commit or self.auto_commit
        if auto_commit:
            await self.session.commit()

    @overload
    async def get(
        self,
        _id: UUID,
        /,
        *,
        session: AsyncSession | None = None,
        nullable: Literal[False],
    ) -> SQLModel: ...

    @overload
    async def get(
        self,
        _id: UUID,
        /,
        *,
        session: AsyncSession | None = None,
        nullable: Literal[True],
    ) -> SQLModel | None: ...

    @overload
    async def get(
        self,
        _id: UUID,
        /,
        *,
        session: AsyncSession | None = None,
    ) -> SQLModel | None: ...

    async def get(
        self,
        _id: UUID,
        /,
        *,
        nullable: bool = True,
        session: AsyncSession | None = None,
    ) -> SQLModel | None:
        """
        根据主键查询单条记录。

        Args:
            _id: 要查询的主键。
            nullable: True 时未找到返回 None，False 时未找到抛出异常。
            session: SQLAlchemy 异步会话。

        Returns:
            SQLModel: 查询到的模型实例，未找到时返回 None。

        Raises:
            NotFoundException: nullable 为 False 且未找到时抛出。
        """
        session = session or self.session
        statement = select(self.model).filter(col(self.model.id) == _id)
        result = await session.exec(statement)
        response = result.first()

        if not nullable and not response:
            raise AppException(StatusCode.RESOURCE_NOT_FOUND)

        return response

    @overload
    async def get_by_ids(
        self,
        ids: list[UUID],
        *,
        order_by: ColumnElement[Any] | Any | None = None,
        session: AsyncSession | None = None,
        serializer: type[_PydanticBaseModel],
    ) -> list[_PydanticBaseModel]: ...

    @overload
    async def get_by_ids(
        self,
        ids: list[UUID],
        *,
        order_by: ColumnElement[Any] | Any | None = None,
        session: AsyncSession | None = None,
        serializer: Literal[None] = None,
    ) -> list[SQLModel]: ...

    async def get_by_ids(
        self,
        ids: list[UUID],
        *,
        order_by: ColumnElement[Any] | Any | None = None,
        session: AsyncSession | None = None,
        serializer: type[_PydanticBaseModel] | None = None,
    ) -> list[SQLModel] | list[_PydanticBaseModel]:
        """
        根据主键列表批量查询记录。

        Args:
            ids: 要查询的主键列表。
            order_by: 可选排序字段。
            session: SQLAlchemy 异步会话。
            serializer: 可选的 Pydantic 模型类用于序列化。

        Returns:
            list[SQLModel]: 查询到的记录列表，未找到返回空列表。
        """
        if not ids:
            raise AppException(StatusCode.MISSING_REQUIRED_FIELD)

        session = session or self.session
        statement = select(self.model).filter(col(self.model.id).in_(ids))
        if order_by is not None:
            statement = statement.order_by(order_by)
        result = await session.exec(statement)
        response = cast(list[SQLModel], result.all())

        if serializer is not None:
            return [serializer.model_validate(item) for item in response]
        return response

    @overload
    async def get_all(
        self,
        *args: ColumnElement[Any],
        order_by: ColumnElement[Any] | Any | None = None,
        session: AsyncSession | None = None,
        serializer: type[_PydanticBaseModel],
    ) -> list[_PydanticBaseModel]: ...

    @overload
    async def get_all(
        self,
        *args: ColumnElement[Any],
        order_by: ColumnElement[Any] | Any | None = None,
        session: AsyncSession | None = None,
        serializer: Literal[None] = None,
    ) -> list[SQLModel]: ...

    async def get_all(
        self,
        *args: ColumnElement[Any],
        order_by: ColumnElement[Any] | Any | None = None,
        session: AsyncSession | None = None,
        serializer: type[_PydanticBaseModel] | None = None,
    ) -> list[SQLModel] | list[_PydanticBaseModel]:
        """
        查询所有记录，可选过滤条件。

        Args:
            args: 可选的过滤条件。
            order_by: 可选排序字段。
            session: SQLAlchemy 异步会话。
            serializer: 可选的 Pydantic 模型类用于序列化。

        Returns:
            list[SQLModel]: 匹配条件的所有记录。

        Examples:
            from sqlmodel import col
            await self.get_all(order_by=col(YourModel.id).desc())
        """
        session = session or self.session
        statement = select(self.model).filter(*args)
        if order_by is not None:
            statement = statement.order_by(order_by)
        result = await session.exec(statement)
        response = cast(list[SQLModel], result.all())

        if serializer is not None:
            return [serializer.model_validate(item) for item in response]
        return response

    async def get_count(
        self,
        *args: ColumnExpressionArgument[bool],
        session: AsyncSession | None = None,
    ) -> int:
        """
        查询记录数量，可选过滤条件。

        Args:
            args: 可选的过滤条件。
            session: SQLAlchemy 异步会话。

        Returns:
            int: 匹配条件的记录总数。
        """
        session = session or self.session
        statement = select(func.count()).select_from(self.model).filter(*args)
        response = await session.exec(statement)

        return response.one()

    @overload
    async def get_paginate(
        self,
        *args: ColumnExpressionArgument[bool],
        page: int = 1,
        size: int = 20,
        order_by: ColumnElement[Any] | Any | None = None,
        session: AsyncSession | None = None,
        serializer: type[_PydanticBaseModel],
    ) -> PaginatedResponse[_PydanticBaseModel]: ...

    @overload
    async def get_paginate(
        self,
        *args: ColumnExpressionArgument[bool],
        page: int = 1,
        size: int = 20,
        order_by: ColumnElement[Any] | Any | None = None,
        session: AsyncSession | None = None,
        serializer: Literal[None] = None,
    ) -> PaginatedResponse[SQLModel]: ...

    async def get_paginate(
        self,
        *args: ColumnExpressionArgument[bool],
        page: int = 1,
        size: int = 20,
        order_by: ColumnElement[Any] | Any | None = None,
        session: AsyncSession | None = None,
        serializer: type[_PydanticBaseModel] | None = None,
    ) -> PaginatedResponse[SQLModel] | PaginatedResponse[_PydanticBaseModel]:
        """
        分页查询记录，可选过滤和排序。

        Args:
            args: 可选的过滤条件。
            page: 页码。
            size: 每页数量。
            order_by: 可选排序字段。
            session: SQLAlchemy 异步会话。
            serializer: 可选的 Pydantic 模型类用于序列化。

        Returns:
            PaginatedResponse[SQLModel]: 包含记录和元数据的分页响应。
        """
        session = session or self.session
        statement = select(self.model).filter(*args).offset((page - 1) * size).limit(size)

        if order_by is not None:
            statement = statement.order_by(order_by)

        result = await session.exec(statement)
        response = cast(list[SQLModel], result.all() or [])
        total = await self.get_count(*args, session=session)

        if serializer is not None:
            return PaginatedResponse(
                records=[serializer.model_validate(item) for item in response],
                total=total,
                page=page,
                page_size=size,
            )

        return PaginatedResponse(records=response, total=total, page=page, page_size=size)

    async def create(
        self,
        create_in: CreateSchema | SQLModel | dict[str, Any],
        *,
        validate: bool = True,
        session: AsyncSession | None = None,
        auto_commit: bool = False,
    ) -> SQLModel:
        """
        创建新记录。

        Args:
            create_in: 新建数据，可为 schema、模型或字典。
            validate: 是否在创建前校验数据，默认 True。
            session: SQLAlchemy 异步会话。
            auto_commit: 是否自动提交更改，默认 False。

        Returns:
            SQLModel: 新创建的模型实例。

        Raises:
            ExistsException: 存在唯一约束冲突时抛出。
            TypeError: 校验失败且 validate=True 时抛出。
        """
        session = session or self.session
        if not validate:
            if not isinstance(create_in, self.model):
                raise AppException(StatusCode.VALIDATION_ERROR)
        else:
            create_in = self.model.model_validate(create_in)

        try:
            session.add(create_in)
            await session.flush()

            await self.commit(auto_commit=auto_commit)
            await session.refresh(create_in)
        except IntegrityError:
            await session.rollback()
            raise AppException(StatusCode.ALREADY_EXISTS)

        return create_in  # type: ignore

    async def create_all(
        self,
        creates_in: Sequence[CreateSchema | SQLModel | dict[str, Any]],
        *,
        session: AsyncSession | None = None,
        auto_commit: bool = False,
    ) -> None:
        """
        批量创建记录。

        Args:
            creates_in: 用于创建新记录的数据列表。
            session: 可选 SQLAlchemy 异步会话。
            auto_commit: 是否自动提交更改，默认 False。

        Raises:
            ExistsException: 存在唯一约束冲突时抛出。
        """
        if not creates_in:
            raise AppException(StatusCode.MISSING_REQUIRED_FIELD)

        session = session or self.session
        creates_in = [self.model.model_validate(create_item) for create_item in creates_in]

        try:
            session.add_all(creates_in)
            await session.flush()

            await self.commit(auto_commit=auto_commit)
        except IntegrityError:
            await session.rollback()
            raise AppException(StatusCode.ALREADY_EXISTS)

    async def update(
        self,
        current_model: SQLModel,
        update_in: UpdateSchema | SQLModel | dict[str, Any],
        *,
        session: AsyncSession | None = None,
        auto_commit: bool = False,
    ) -> SQLModel:
        """
        更新指定模型实例。

        Args:
            current_model: 需要更新的模型实例。
            update_in: 更新数据，可为 schema、模型或字典，仅更新已设置的字段。
            session: SQLAlchemy 异步会话。
            auto_commit: 是否自动提交更改，默认 False。

        Returns:
            SQLModel: 更新后的模型实例。

        Note:
            仅更新 update_in 中显式设置的字段。
        """
        session = session or self.session
        if not isinstance(update_in, dict):
            update_in = update_in.model_dump(exclude_unset=True)

        for field, value in update_in.items():
            setattr(current_model, field, value)

        response = await self.create(current_model, validate=False, session=session, auto_commit=auto_commit)
        return response

    async def update_by_id(
        self,
        _id: UUID,
        /,
        update_in: UpdateSchema | dict[str, Any],
        *,
        session: AsyncSession | None = None,
        auto_commit: bool = False,
    ) -> SQLModel:
        """
        根据主键更新记录。

        Args:
            _id: 要更新的主键。
            update_in: 更新数据。
            session: SQLAlchemy 异步会话。
            auto_commit: 是否自动提交更改，默认 False。

        Returns:
            SQLModel: 更新后的模型实例。

        Raises:
            NotFoundException: 未找到指定 ID 的记录时抛出。
        """
        session = session or self.session
        response = await self.get(_id, nullable=False, session=session)
        return await self.update(response, update_in, session=session, auto_commit=auto_commit)

    async def update_all(
        self,
        updates_in: list[dict[str, Any]],
        *,
        session: AsyncSession | None = None,
        auto_commit: bool = False,
    ) -> None:
        """
        批量根据主键更新记录。

        Args:
            updates_in: 更新数据列表。
            session: SQLAlchemy 异步会话。
            auto_commit: 是否自动提交更改，默认 False。

        Raises:
            InvalidParameterError: 缺少 id 字段时抛出。
            NotFoundException: 未找到指定 ID 的记录时抛出。
        """
        if not updates_in:
            raise AppException(StatusCode.MISSING_REQUIRED_FIELD)

        session = session or self.session
        try:
            for index, update_info in enumerate(updates_in):
                _id = update_info.pop("id", None)
                if not _id:
                    raise AppException(StatusCode.MISSING_REQUIRED_FIELD)

                statement = update(self.model).where(col(self.model.id) == _id).values(**update_info)
                result = await session.exec(statement)  # type: ignore
                if result.rowcount == 0:
                    raise AppException(StatusCode.RESOURCE_NOT_FOUND)

            await self.commit(auto_commit=auto_commit)

        except SQLAlchemyError as e:
            await session.rollback()
            raise SQLAlchemyError("Database error during batch update.") from e

    async def delete(self, _id: UUID, /, *, session: AsyncSession | None = None, auto_commit: bool = False) -> SQLModel:
        """
        根据主键删除记录。

        Args:
            _id: 要删除的主键。
            session: SQLAlchemy 会话。
            auto_commit: 是否自动提交更改，默认 False。

        Returns:
            SQLModel: 被删除的记录。

        Raises:
            NotFoundException: 未找到指定主键的记录时抛出。
        """
        session = session or self.session
        response = await self.get(_id, nullable=False, session=session)
        await session.delete(response)
        await self.commit(auto_commit=auto_commit)
        return response

    async def delete_all(
        self,
        ids: list[UUID],
        /,
        *,
        session: AsyncSession | None = None,
        auto_commit: bool = True,
    ) -> None:
        """
        批量根据主键删除记录。

        Args:
            ids: 要删除的主键列表。
            session: 可选 SQLAlchemy 异步会话。
            auto_commit: 是否自动提交更改，默认 True。
        """
        if not ids:
            raise AppException(StatusCode.MISSING_REQUIRED_FIELD)

        session = session or self.session
        statement = delete(self.model).filter(col(self.model.id).in_(ids))
        await session.exec(statement)  # type: ignore
        await self.commit(auto_commit=auto_commit)
