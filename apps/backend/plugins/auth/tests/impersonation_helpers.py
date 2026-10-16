"""HTTP contract uses real authentication and permission resolution."""

import asyncio
import sys
from typing import cast

import pytest_asyncio
from cryptography.hazmat.primitives.asymmetric.rsa import RSAPublicKey
from plugin_permission.role.deps import verify_user_permission
from plugin_permission.router.sync import store_router_in_db
from plugin_user.models import User
from rapidkit_framework.events import event_bus
from rapidkit_security import encrypt_message, hash_password, load_public_pem


@pytest_asyncio.fixture
async def strict_client(client, init):
    app = sys.modules["src.main"].app
    override = app.dependency_overrides.pop(verify_user_permission, None)
    await store_router_in_db(app.routes)
    yield client
    if override is not None:
        app.dependency_overrides[verify_user_permission] = override


@pytest_asyncio.fixture
async def target(session):
    user = User(
        username="impersonation-target",
        name="Target",
        email="impersonation@example.com",
        password=hash_password("Test123456!"),
    )
    session.add(user)
    await session.commit()
    return user


async def login_headers(client, username: str, password: str) -> dict[str, str]:
    public = (await client.get("/auth/keys/public")).json()["data"]
    response = await client.post(
        "/auth/login",
        json={
            "username": username,
            "password": encrypt_message(cast(RSAPublicKey, load_public_pem(public)), password),
        },
    )
    assert response.json()["code"] == 0
    return {"Authorization": "Bearer " + response.json()["data"]["accessToken"]}


async def drain_identity_events():
    while pending := [task for task in event_bus._pending_tasks if task is not event_bus._subscriber_task]:
        await asyncio.gather(*pending)
