from uuid import uuid4

import pytest

import plugin_user.api as user_api
from plugin_user.status_codes import UserStatusCode
from rapidkit_common.enums import Status
from rapidkit_framework.exceptions import AppException


class CRUD:
    def __init__(self, status: Status) -> None:
        self.user = type("User", (), {"id": uuid4(), "status": status})()

    async def get(self, user_id, nullable=False):
        return self.user


@pytest.mark.asyncio
async def test_resend_rejects_non_pending(monkeypatch) -> None:
    monkeypatch.setattr(user_api.event_bus, "fire_and_forget", lambda event: None)
    current = type("Current", (), {"id": uuid4(), "is_admin": True})()
    with pytest.raises(AppException) as exc:
        await user_api.resend_invite(uuid4(), current, CRUD(Status.ON))
    assert exc.value.code == UserStatusCode.USER_NOT_PENDING.code


@pytest.mark.asyncio
async def test_resend_fires_event_for_pending(monkeypatch) -> None:
    fired = []
    monkeypatch.setattr(user_api.event_bus, "fire_and_forget", fired.append)
    current = type("Current", (), {"id": uuid4(), "is_admin": True})()
    user_id = uuid4()
    result = await user_api.resend_invite(user_id, current, CRUD(Status.PENDING))
    assert result.data is True
    assert fired[0].user_id == str(user_id)
