from datetime import datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from plugin_auth.auth.api import get_user_info
from rapidkit_core.config import settings


@pytest.mark.asyncio
@pytest.mark.parametrize("zone", ["Asia/Shanghai", "Europe/Berlin"])
async def test_authenticated_user_info_includes_platform_timezone(monkeypatch, zone):
    monkeypatch.setattr(settings, "DATETIME_TIMEZONE", zone)
    user = SimpleNamespace(
        id=uuid4(),
        name="Admin",
        username="admin",
        email="admin@example.com",
        is_admin=True,
        roles=[],
        create_time=datetime(2026, 10, 30, 8),
        update_time=datetime(2026, 10, 30, 8),
    )
    response = await get_user_info(user, AsyncMock())
    assert response.model_dump(mode="json", by_alias=True)["data"]["timezone"] == zone
