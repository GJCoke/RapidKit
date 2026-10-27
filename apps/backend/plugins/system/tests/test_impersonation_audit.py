"""Synchronous lifecycle audits share the caller transaction."""

from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
from plugin_system import register
from plugin_system.audit.impersonation import ImpersonationAuditWriterImpl
from plugin_system.audit.models import AuditLog
from rapidkit_common.events import (
    PluginLoadFailedEvent,
    TaskFailedEvent,
    TaskSucceededEvent,
    UserLoginEvent,
    WorkerCapacityChangedEvent,
    WorkerOfflineEvent,
)
from rapidkit_common.protocols import ImpersonationAuditWriter
from rapidkit_framework.services import ServiceRegistry
from sqlalchemy.exc import SQLAlchemyError


@pytest.mark.asyncio
async def test_writer_flushes_same_session_without_transaction_ownership():
    session = MagicMock()
    session.flush = AsyncMock()
    session.commit = AsyncMock()
    session.rollback = AsyncMock()
    actor, subject, impersonation = uuid4(), uuid4(), uuid4()
    record = {
        "action": "impersonation.start",
        "result": "success",
        "source": "system",
        "actor_id": actor,
        "subject_user_id": subject,
        "impersonation_session_id": impersonation,
    }
    await ImpersonationAuditWriterImpl().append(session, record)
    session.add.assert_called_once()
    audit = session.add.call_args.args[0]
    assert isinstance(audit, AuditLog)
    assert (audit.actor_id, audit.subject_user_id, audit.impersonation_session_id) == (actor, subject, impersonation)
    assert audit.action == "impersonation.start"
    session.flush.assert_awaited_once_with()
    session.commit.assert_not_called()
    session.rollback.assert_not_called()
    session.begin.assert_not_called()
    session.begin_nested.assert_not_called()


@pytest.mark.asyncio
async def test_writer_propagates_database_flush_failure():
    session = MagicMock()
    failure = SQLAlchemyError("database unavailable")
    session.flush = AsyncMock(side_effect=failure)
    with pytest.raises(SQLAlchemyError) as exc:
        await ImpersonationAuditWriterImpl().append(
            session, {"action": "impersonation.stop", "result": "success", "source": "system"}
        )
    assert exc.value is failure
    session.add.assert_called_once()
    session.commit.assert_not_called()
    session.rollback.assert_not_called()


def test_manifest_registers_writer_and_preserves_existing_services():
    manifest = register()
    assert ImpersonationAuditWriter in manifest.provides
    registry = ServiceRegistry()
    manifest.service_factories[ImpersonationAuditWriter](registry)
    assert isinstance(registry.get(ImpersonationAuditWriter), ImpersonationAuditWriterImpl)
    assert manifest.dependencies == ["auth", "menu"]
    required_events = {
        UserLoginEvent,
        TaskSucceededEvent,
        TaskFailedEvent,
        WorkerOfflineEvent,
        WorkerCapacityChangedEvent,
        PluginLoadFailedEvent,
    }
    assert required_events <= {event for event, handler in manifest.event_listeners if callable(handler)}
    assert manifest.on_startup and manifest.on_shutdown
