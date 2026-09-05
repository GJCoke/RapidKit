"""Tests for ``UserQueryServiceImpl.get_all_active_user_ids``."""

from uuid import UUID, uuid4

import pytest
from plugin_user.providers import UserQueryServiceImpl
from rapidkit_common.enums import Status
from sqlalchemy.sql.elements import ClauseElement


class _Result:
    def __init__(self, user_ids: list[UUID]) -> None:
        self._user_ids = user_ids

    def all(self) -> list[UUID]:
        return self._user_ids


class _Session:
    def __init__(self, user_ids: list[UUID]) -> None:
        self._user_ids = user_ids
        self.statement: ClauseElement | None = None

    async def exec(self, statement: ClauseElement) -> _Result:
        self.statement = statement
        return _Result(self._user_ids)


class _SessionFactory:
    def __init__(self, user_ids: list[UUID]) -> None:
        self._session = _Session(user_ids)

    def __call__(self) -> _SessionFactory:
        return self

    async def __aenter__(self) -> _Session:
        return self._session

    async def __aexit__(self, _exc_type: object, _exc_value: object, _traceback: object) -> None:
        return None


@pytest.mark.asyncio
async def test_get_all_active_user_ids_returns_query_result_ids():
    expected_ids = [uuid4(), uuid4()]
    session_factory = _SessionFactory(expected_ids)
    service = UserQueryServiceImpl(session_factory=session_factory)

    user_ids = await service.get_all_active_user_ids()

    assert user_ids == expected_ids
    assert session_factory._session.statement is not None
    compiled_statement = session_factory._session.statement.compile()
    assert "WHERE user_users.status =" in str(compiled_statement)
    assert Status.ON in compiled_statement.params.values()
