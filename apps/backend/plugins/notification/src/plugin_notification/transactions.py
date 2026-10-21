"""Request-owned sessions and explicit standalone notification transactions."""

from collections.abc import AsyncIterator, Callable
from contextlib import AbstractAsyncContextManager, asynccontextmanager
from inspect import isawaitable
from typing import Any

from rapidkit_common.transaction import after_commit, run_after_commit_hooks
from sqlmodel.ext.asyncio.session import AsyncSession

type SessionFactory = Callable[[], AbstractAsyncContextManager[AsyncSession]]


@asynccontextmanager
async def notification_session(factory: SessionFactory, session: AsyncSession | None) -> AsyncIterator[AsyncSession]:
    if session is not None:
        yield session
    else:
        async with factory() as owned_session:
            yield owned_session


def defer_notification_effect(session: AsyncSession, callback: Callable[..., Any], *args: Any, **kwargs: Any) -> None:
    """Adapt synchronous audits/enqueue callbacks to the shared async commit hooks."""

    async def invoke() -> None:
        result = callback(*args, **kwargs)
        if isawaitable(result):
            await result

    after_commit(session, invoke)


async def complete_notification_write(session: AsyncSession, *, owned: bool) -> None:
    if owned:
        prepare = session.info.pop("_audit_prepare", None)
        if prepare is not None:
            await prepare(session)
        await session.commit()
        await run_after_commit_hooks(session)
    else:
        await session.flush()
