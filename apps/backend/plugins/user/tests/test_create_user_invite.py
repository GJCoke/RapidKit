from uuid import uuid4

import pytest

from plugin_user.schemas import UserManageCreate
from rapidkit_common.enums import Status


def test_create_schema_has_no_password_field() -> None:
    assert "password" not in UserManageCreate.model_fields


@pytest.mark.asyncio
async def test_create_user_forces_pending_and_unusable_password(monkeypatch) -> None:
    import plugin_user.api as user_api

    captured: dict = {}

    class CRUD:
        async def create(self, data: dict):
            captured.update(data)
            return type("User", (), {"id": uuid4()})()

    class Body:
        is_admin = False

        def model_dump(self):
            return {"username": "user1", "name": "Name", "email": "e@x.io", "status": Status.ON}

    current = type("Current", (), {"id": uuid4(), "is_admin": True})()
    monkeypatch.setattr(user_api.event_bus, "fire_and_forget", lambda event: None)
    monkeypatch.setattr(user_api.UserManageResponse, "model_validate", lambda user: user)
    await user_api.create_user(Body(), current, CRUD())
    assert captured["status"] == Status.PENDING
    assert isinstance(captured["password"], bytes) and captured["password"]
