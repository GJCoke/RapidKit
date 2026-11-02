"""SQLAlchemy boundaries keep pool acquisition separate from cursor execution."""

import time

from sqlalchemy import event
from sqlalchemy.pool import AsyncAdaptedQueuePool, QueuePool

from rapidkit_core.dependency_observation import finish_dependency, observe_dependency


class ObservedAsyncPool(AsyncAdaptedQueuePool):
    def _do_get(self):
        with observe_dependency("postgresql", "pool.acquire"):
            return super()._do_get()


class ObservedSyncPool(QueuePool):
    def _do_get(self):
        with observe_dependency("postgresql", "pool.acquire"):
            return super()._do_get()


def instrument_sql(engine) -> None:
    if event.contains(engine, "before_cursor_execute", _before):
        return
    event.listen(engine, "before_cursor_execute", _before)
    event.listen(engine, "after_cursor_execute", _after)
    event.listen(engine, "handle_error", _failed)


def _before(connection, cursor, statement, parameters, context, executemany):
    # Classify a verb only. Never retain SQL, parameters, URL or connection objects.
    verb = statement.lstrip().split(None, 1)[0].lower() if statement.strip() else "other"
    operation = "query." + (verb if verb in ("select", "insert", "update", "delete") else "other")
    context._rapidkit_observation = (operation, time.perf_counter())


def _finish(context, error=None):
    state = getattr(context, "_rapidkit_observation", None)
    if state is not None:
        context._rapidkit_observation = None
        operation, started = state
        finish_dependency("postgresql", operation, started, error)


def _after(connection, cursor, statement, parameters, context, executemany):
    _finish(context)


def _failed(context):
    _finish(context.execution_context, context.sqlalchemy_exception or context.original_exception)
