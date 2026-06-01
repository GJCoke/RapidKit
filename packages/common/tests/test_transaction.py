"""Tests for rapidkit_common.transaction — after-commit hooks."""

import pytest

from rapidkit_common.transaction import after_commit, run_after_commit_hooks


class _FakeSession:
    """Minimal stand-in for an SQLAlchemy AsyncSession."""


@pytest.mark.asyncio(loop_scope="function")
async def test_hooks_run_when_called():
    session = _FakeSession()
    called = []

    async def hook(value: int) -> None:
        called.append(value)

    after_commit(session, hook, 42)
    await run_after_commit_hooks(session)

    assert called == [42]


@pytest.mark.asyncio(loop_scope="function")
async def test_no_error_when_no_hooks():
    session = _FakeSession()
    # Should complete without raising.
    await run_after_commit_hooks(session)


@pytest.mark.asyncio(loop_scope="function")
async def test_hooks_cleared_after_run():
    session = _FakeSession()
    called = []

    async def hook() -> None:
        called.append(1)

    after_commit(session, hook)
    await run_after_commit_hooks(session)
    assert called == [1]

    # Running again should not re-fire the hook.
    await run_after_commit_hooks(session)
    assert called == [1]


@pytest.mark.asyncio(loop_scope="function")
async def test_hooks_run_in_order():
    session = _FakeSession()
    order: list[str] = []

    async def first() -> None:
        order.append("first")

    async def second() -> None:
        order.append("second")

    async def third() -> None:
        order.append("third")

    after_commit(session, first)
    after_commit(session, second)
    after_commit(session, third)
    await run_after_commit_hooks(session)

    assert order == ["first", "second", "third"]


@pytest.mark.asyncio(loop_scope="function")
async def test_failing_hook_does_not_block_others():
    session = _FakeSession()
    called = []

    async def bad_hook() -> None:
        raise RuntimeError("boom")

    async def good_hook() -> None:
        called.append("ok")

    after_commit(session, bad_hook)
    after_commit(session, good_hook)
    await run_after_commit_hooks(session)

    assert called == ["ok"]


@pytest.mark.asyncio(loop_scope="function")
async def test_hooks_receive_kwargs():
    session = _FakeSession()
    captured: dict = {}

    async def hook(*, key: str, value: int) -> None:
        captured["key"] = key
        captured["value"] = value

    after_commit(session, hook, key="x", value=7)
    await run_after_commit_hooks(session)

    assert captured == {"key": "x", "value": 7}
