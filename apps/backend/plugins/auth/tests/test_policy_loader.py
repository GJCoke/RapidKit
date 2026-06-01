"""Tests for batch policy loading."""

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from plugin_permission.adapters import AuthPolicyLoader


class TestAuthPolicyLoaderBatch:
    @pytest.mark.asyncio
    async def test_empty_ids_returns_empty(self):
        redis = AsyncMock()
        session = AsyncMock()
        loader = AuthPolicyLoader(redis, session)
        result = await loader.load([])
        assert result == []
        redis.mget.assert_not_called()

    @pytest.mark.asyncio
    async def test_mget_loads_cached_policies_in_one_call(self):
        """All cached policies should be fetched in a single mget call."""
        redis = AsyncMock()
        pid1, pid2 = uuid4(), uuid4()

        # Simulate mget returning serialized policy data (must match DataPolicyResponse schema)
        policy_json_1 = '{"id":"00000000-0000-0000-0000-000000000001","name":"p1","description":"","target_model":"users","rule":{},"status":"1","create_time":"2026-01-01T00:00:00","update_time":"2026-01-01T00:00:00"}'
        policy_json_2 = '{"id":"00000000-0000-0000-0000-000000000002","name":"p2","description":"","target_model":"users","rule":{},"status":"1","create_time":"2026-01-01T00:00:00","update_time":"2026-01-01T00:00:00"}'
        redis.mget.return_value = [policy_json_1, policy_json_2]

        session = AsyncMock()
        loader = AuthPolicyLoader(redis, session)
        result = await loader.load([pid1, pid2])

        redis.mget.assert_called_once()
        assert len(result) == 2

    @pytest.mark.asyncio
    async def test_uncached_policies_fetched_from_db(self):
        """Policies not in Redis should be loaded from DB and cached via pipeline."""
        redis = AsyncMock()
        pid1, pid2 = uuid4(), uuid4()

        # First one cached, second one not
        policy_json = '{"id":"00000000-0000-0000-0000-000000000001","name":"p1","description":"","target_model":"users","rule":{},"status":"1","create_time":"2026-01-01T00:00:00","update_time":"2026-01-01T00:00:00"}'
        redis.mget.return_value = [policy_json, None]

        # pipeline() is sync, returns an object with sync set() and async execute()
        pipe = MagicMock()
        pipe.execute = AsyncMock(return_value=[])
        redis.pipeline = MagicMock(return_value=pipe)

        # Mock DB
        session = AsyncMock()
        db_policy = SimpleNamespace(
            id=pid2,
            name="p2",
            description="",
            target_model="users",
            rule={},
            status="1",
            create_time="2026-01-01T00:00:00",
            update_time="2026-01-01T00:00:00",
        )

        with patch("plugin_permission.adapters.DataPolicyCRUD") as mock_crud_cls:
            mock_crud = AsyncMock()
            mock_crud_cls.return_value = mock_crud
            mock_crud.get_by_ids.return_value = [db_policy]

            loader = AuthPolicyLoader(redis, session)
            result = await loader.load([pid1, pid2])

        assert len(result) == 2
        pipe.execute.assert_called_once()
