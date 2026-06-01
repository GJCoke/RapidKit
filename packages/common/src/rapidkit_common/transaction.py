"""
Transaction boundary utilities.

Provides after-commit hook registration so that side-effects (e.g. event
publishing, cache invalidation) run only after the database transaction
has been successfully committed.
"""

from collections.abc import Callable, Coroutine
from typing import Any

from rapidkit_core.log import logger

_HOOKS_ATTR = "_after_commit_hooks"


def after_commit(
    session: Any,
    fn: Callable[..., Coroutine[Any, Any, Any]],
    *args: Any,
    **kwargs: Any,
) -> None:
    """Register an async callback to run after the session commits."""
    hooks: list[tuple[Callable[..., Coroutine[Any, Any, Any]], tuple[Any, ...], dict[str, Any]]] = getattr(
        session, _HOOKS_ATTR, []
    )
    hooks.append((fn, args, kwargs))
    setattr(session, _HOOKS_ATTR, hooks)


async def run_after_commit_hooks(session: Any) -> None:
    """Execute and clear all registered after-commit hooks.

    Hooks are fire-and-forget: exceptions are logged as warnings and
    do not propagate.  Hooks run in registration order.
    """
    hooks: list[tuple[Callable[..., Coroutine[Any, Any, Any]], tuple[Any, ...], dict[str, Any]]] = getattr(
        session, _HOOKS_ATTR, []
    )
    # Clear immediately so re-entrant calls see an empty list.
    setattr(session, _HOOKS_ATTR, [])

    for fn, args, kwargs in hooks:
        try:
            await fn(*args, **kwargs)
        except Exception:
            logger.warning("after-commit hook %s failed", fn.__qualname__, exc_info=True)
