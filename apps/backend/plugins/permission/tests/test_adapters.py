"""Tests for permission infrastructure adapters."""

from unittest.mock import AsyncMock

import pytest
from plugin_permission.adapters import AuthPolicyLoader
from plugin_permission.data_policy.schemas import DataPolicyResponse
from plugin_permission.models import DataPolicy


@pytest.mark.asyncio
async def test_cached_policy_preserves_effect_and_actions():
    policy = DataPolicy(
        name="deny writes",
        description="deny writes outside the owner scope",
        target_model="documents",
        rule={"field": "owner_id", "op": "eq", "value": "current_user.id"},
        effect="deny",
        actions=["write"],
    )
    redis = AsyncMock()
    redis.mget.return_value = [DataPolicyResponse.model_validate(policy).model_dump_json()]

    loaded = await AuthPolicyLoader(redis, AsyncMock()).load([policy.id])

    assert len(loaded) == 1
    assert loaded[0].effect == "deny"
    assert loaded[0].actions == ["write"]
