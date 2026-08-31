from uuid import uuid4

import pytest
from plugin_auth.password_reset import service
from plugin_auth.status_codes import AuthStatusCode
from rapidkit_common.enums import Status
from rapidkit_common.protocols.auth import PasswordDecryptor
from rapidkit_framework.exceptions import AppException


class FakeUser:
    def __init__(self, status: Status) -> None:
        self.id = uuid4()
        self.status = status
        self.email = "user@example.com"
        self.name = "Alice"


class FakeStore:
    def __init__(self, *, allowed: bool = True, consumed: str | None = None) -> None:
        self.allowed = allowed
        self.consumed = consumed
        self.issued_for = None

    async def allow_request(self, email: str, ip: str) -> bool:
        return self.allowed

    async def issue(self, user_id):
        self.issued_for = user_id
        return "issued"

    async def consume(self, token: str):
        value, self.consumed = self.consumed, None
        return value


class FakeCRUD:
    def __init__(self, user: FakeUser | None, *, fail_update: bool = False) -> None:
        self.user = user
        self.fail_update = fail_update
        self.lookup_email = None
        self.updated = None

    async def get_user_by_email(self, email: str):
        self.lookup_email = email
        return self.user

    async def get(self, user_id, nullable=True):
        return self.user if self.user and self.user.id == user_id else None

    async def update_by_id(self, user_id, data):
        if self.fail_update:
            raise RuntimeError("database failed")
        self.updated = (user_id, data)


class FakeDecryptor:
    def decrypt_and_hash(self, encrypted_password: str) -> bytes:
        assert encrypted_password == "encrypted"
        return b"hashed"


class FakeInvalidator:
    async def invalidate_user_cache(self, user_id, redis) -> None: ...

    async def invalidate_user_sessions(self, user_id, redis) -> None: ...


@pytest.mark.asyncio
@pytest.mark.parametrize("status", [None, Status.PENDING, Status.OFF])
async def test_request_does_not_queue_email_for_ineligible_account(monkeypatch, status) -> None:
    user = FakeUser(status) if status is not None else None
    queued = []
    monkeypatch.setattr(service, "_enqueue_password_reset_email", lambda **kwargs: queued.append(kwargs))

    await service.request_password_reset(
        " User@Example.com ",
        "192.0.2.1",
        store=FakeStore(),
        user_crud=FakeCRUD(user),
    )

    assert queued == []


@pytest.mark.asyncio
async def test_request_normalizes_email_and_queues_active_user(monkeypatch) -> None:
    user = FakeUser(Status.ON)
    crud = FakeCRUD(user)
    store = FakeStore()
    queued = []
    monkeypatch.setattr(service, "_enqueue_password_reset_email", lambda **kwargs: queued.append(kwargs))

    await service.request_password_reset(
        " User@Example.com ",
        "192.0.2.1",
        store=store,
        user_crud=crud,
    )

    assert crud.lookup_email == "user@example.com"
    assert store.issued_for == user.id
    assert queued[0] == {
        "email": user.email,
        "user_name": user.name,
        "reset_link": "http://localhost:9527/login/reset-password?token=issued",
    }


@pytest.mark.asyncio
async def test_confirm_updates_password_and_registers_session_cleanup(monkeypatch) -> None:
    user = FakeUser(Status.ON)
    crud = FakeCRUD(user)
    store = FakeStore(consumed=str(user.id))
    invalidator = FakeInvalidator()
    hooks = []
    events = []
    monkeypatch.setattr(
        service,
        "get_service",
        lambda protocol: FakeDecryptor() if protocol is PasswordDecryptor else invalidator,
    )
    monkeypatch.setattr(service, "after_commit", lambda *args: hooks.append(args))
    monkeypatch.setattr(service.event_bus, "fire_and_forget", lambda event: events.append(event))

    await service.confirm_password_reset(
        "valid",
        "encrypted",
        store=store,
        user_crud=crud,
        redis="redis",
        session="session",
    )

    assert crud.updated == (user.id, {"password": b"hashed"})
    assert hooks == [
        ("session", invalidator.invalidate_user_cache, user.id, "redis"),
        ("session", invalidator.invalidate_user_sessions, user.id, "redis"),
    ]
    assert events[0].user_id == str(user.id)


@pytest.mark.asyncio
async def test_confirm_rejects_invalid_token() -> None:
    with pytest.raises(AppException) as exc:
        await service.confirm_password_reset(
            "bad",
            "encrypted",
            store=FakeStore(consumed=None),
            user_crud=FakeCRUD(None),
            redis="redis",
            session="session",
        )

    assert exc.value.code == AuthStatusCode.PASSWORD_RESET_TOKEN_INVALID.code


@pytest.mark.asyncio
async def test_consumed_token_is_not_restored_when_update_fails(monkeypatch) -> None:
    user = FakeUser(Status.ON)
    store = FakeStore(consumed=str(user.id))
    monkeypatch.setattr(service, "get_service", lambda protocol: FakeDecryptor())

    with pytest.raises(RuntimeError, match="database failed"):
        await service.confirm_password_reset(
            "valid",
            "encrypted",
            store=store,
            user_crud=FakeCRUD(user, fail_update=True),
            redis="redis",
            session="session",
        )

    assert store.consumed is None
