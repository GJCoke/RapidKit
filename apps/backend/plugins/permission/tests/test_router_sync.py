"""Tests for startup route synchronization cache invalidation."""

from unittest.mock import AsyncMock, MagicMock

import plugin_permission.router.sync as sync
import pytest


def _async_keys(*keys: str):
    async def iterate():
        for key in keys:
            yield key

    return iterate()


def _configure_sync(monkeypatch: pytest.MonkeyPatch, *, changed: bool):
    events: list[str] = []
    redis = MagicMock()
    redis.scan_iter = MagicMock(return_value=_async_keys("auth:permission:<one>", "auth:permission:<two>"))

    async def delete(key):
        events.append(f"delete:{key}")

    redis.delete = AsyncMock(side_effect=delete)
    monkeypatch.setattr(sync.RedisManager, "client", lambda: redis)

    lock = AsyncMock()
    lock.acquire.return_value = True
    monkeypatch.setattr(sync, "DistributedLock", lambda *_args, **_kwargs: lock)

    session = AsyncMock()

    async def commit():
        events.append("commit")

    session.commit.side_effect = commit
    session_context = MagicMock()
    session_context.__aenter__ = AsyncMock(return_value=session)
    session_context.__aexit__ = AsyncMock(return_value=None)
    monkeypatch.setattr(sync, "AsyncSessionLocal", lambda: session_context)

    crud = AsyncMock()
    crud.get_all.return_value = []
    monkeypatch.setattr(sync, "RouterCRUD", lambda _session: crud)
    diff = ([MagicMock()], [], []) if changed else ([], [], [])
    monkeypatch.setattr(sync, "diff_api_routes", lambda *_args: diff)
    return redis, lock, events


@pytest.mark.asyncio
async def test_route_diff_invalidates_all_permission_caches_after_commit(monkeypatch: pytest.MonkeyPatch):
    redis, lock, events = _configure_sync(monkeypatch, changed=True)

    await sync.store_router_in_db([])

    assert events == [
        "commit",
        "delete:auth:permission:<one>",
        "delete:auth:permission:<two>",
    ]
    redis.scan_iter.assert_called_once_with(match="auth:permission:<*>")
    lock.acquire.assert_awaited_once_with()
    lock.release.assert_awaited_once_with()


@pytest.mark.asyncio
async def test_no_route_diff_keeps_permission_caches_warm(monkeypatch: pytest.MonkeyPatch):
    redis, lock, events = _configure_sync(monkeypatch, changed=False)

    await sync.store_router_in_db([])

    assert events == ["commit"]
    redis.scan_iter.assert_not_called()
    redis.delete.assert_not_awaited()
    lock.acquire.assert_awaited_once_with()
    lock.release.assert_awaited_once_with()
