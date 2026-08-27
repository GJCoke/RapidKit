from uuid import uuid4

import pytest

from plugin_auth.auth.services import user_login
from plugin_auth.status_codes import AuthStatusCode
from rapidkit_common.enums import Status
from rapidkit_framework.exceptions import AppException


class FakeUser:
    def __init__(self, status: Status) -> None:
        self.id = uuid4()
        self.name = "Name"
        self.username = "user1"
        self.password = b"hash"
        self.status = status
        self.roles = []


class FakeCRUD:
    def __init__(self, status: Status) -> None:
        self.user = FakeUser(status)

    async def get_user_by_username(self, username: str):
        return self.user


class FakeRedis:
    async def get(self, key):
        return None

    async def delete(self, *keys):
        return None


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("status", "expected"),
    [(Status.PENDING, AuthStatusCode.ACCOUNT_NOT_ACTIVATED), (Status.OFF, AuthStatusCode.USER_DISABLED)],
)
async def test_non_active_user_is_blocked_before_token_issue(monkeypatch, status, expected) -> None:
    monkeypatch.setattr("plugin_auth.auth.services.decrypt_password", lambda password: "plain")
    monkeypatch.setattr("plugin_auth.auth.services.check_password", lambda plain, hashed: True)
    with pytest.raises(AppException) as exc:
        await user_login(
            "user1",
            "enc",
            user_crud=FakeCRUD(status),
            token_store=None,
            redis=FakeRedis(),
            user_agent="ua",
        )
    assert exc.value.code == expected.code
