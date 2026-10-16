import asyncio
from dataclasses import FrozenInstanceError

import pytest
from rapidkit_framework.identity import IdentityMetadata, bind_identity, current_identity, identity_scope


def test_identity_scope_restores_nested_and_bound_identity():
    outer = IdentityMetadata(user_id="subject", actor_id="actor", impersonation_session_id="session")
    inner = IdentityMetadata(user_id="inner", actor_id="inner")
    assert current_identity() == IdentityMetadata()
    with identity_scope(outer):
        assert current_identity() == outer
        with identity_scope(inner):
            assert current_identity() == inner
            bind_identity(IdentityMetadata(user_id="bound"))
            assert current_identity().user_id == "bound"
        assert current_identity() == outer
    assert current_identity() == IdentityMetadata()


def test_identity_scope_restores_after_exception():
    with pytest.raises(ValueError), identity_scope(IdentityMetadata(user_id="subject")):
        raise ValueError("failed operation")
    assert current_identity() == IdentityMetadata()


def test_identity_metadata_is_immutable():
    metadata = IdentityMetadata(user_id="subject")
    with pytest.raises(FrozenInstanceError):
        metadata.user_id = "changed"


@pytest.mark.asyncio
async def test_identity_is_isolated_between_async_tasks():
    parent = IdentityMetadata(user_id="parent")
    ready = asyncio.Event()
    started = 0

    async def worker(user_id):
        nonlocal started
        assert current_identity() == parent
        with identity_scope(IdentityMetadata(user_id=user_id)):
            started += 1
            if started == 2:
                ready.set()
            await ready.wait()
            await asyncio.sleep(0)
            assert current_identity().user_id == user_id
        assert current_identity() == parent

    with identity_scope(parent):
        await asyncio.gather(worker("first"), worker("second"))
        assert current_identity() == parent
    assert current_identity() == IdentityMetadata()
