from uuid import uuid4

import pytest
from plugin_auth.invite.service import set_password_with_token
from plugin_auth.status_codes import AuthStatusCode
from rapidkit_common.enums import Status
from rapidkit_framework.exceptions import AppException


class FakeStore:
    def __init__(self, value: str | None) -> None:
        self.value = value

    async def consume(self, token: str):
        value, self.value = self.value, None
        return value


class FakeUser:
    def __init__(self, user_id, status=Status.PENDING) -> None:
        self.id = user_id
        self.status = status


class FakeCRUD:
    def __init__(self, user) -> None:
        self.user = user
        self.updated = None

    async def get(self, user_id, nullable=True):
        return self.user if self.user and self.user.id == user_id else None

    async def update_by_id(self, user_id, data):
        self.updated = data


@pytest.mark.asyncio
async def test_set_password_invalid_token_raises() -> None:
    with pytest.raises(AppException) as exc:
        await set_password_with_token("bad", "enc", invite_store=FakeStore(None), user_crud=FakeCRUD(None))
    assert exc.value.code == AuthStatusCode.INVITE_TOKEN_INVALID.code


@pytest.mark.asyncio
async def test_set_password_activates_pending_user(monkeypatch) -> None:
    user_id = uuid4()
    crud = FakeCRUD(FakeUser(user_id))

    class Decryptor:
        def decrypt_and_hash(self, encrypted: str) -> bytes:
            return b"hashed"

    monkeypatch.setattr("plugin_auth.invite.service.get_service", lambda protocol: Decryptor())
    await set_password_with_token("good", "enc", invite_store=FakeStore(str(user_id)), user_crud=crud)
    assert crud.updated == {"password": b"hashed", "status": Status.ON}


@pytest.mark.asyncio
async def test_set_password_rejects_already_active_user(monkeypatch) -> None:
    user_id = uuid4()
    crud = FakeCRUD(FakeUser(user_id, Status.ON))
    with pytest.raises(AppException) as exc:
        await set_password_with_token("good", "enc", invite_store=FakeStore(str(user_id)), user_crud=crud)
    assert exc.value.code == AuthStatusCode.INVITE_TOKEN_INVALID.code
