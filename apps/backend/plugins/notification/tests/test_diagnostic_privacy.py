import io
import json
import sys
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest
from rapidkit_core import log
from rapidkit_core.config import settings
from rapidkit_core.environment import Environment
from rapidkit_framework.exceptions import AppException


@pytest.fixture
def production_files(monkeypatch, tmp_path):
    output = io.StringIO()
    monkeypatch.setattr(sys, "stdout", output)
    monkeypatch.setattr(settings, "ENVIRONMENT", Environment.PRODUCTION)
    monkeypatch.setattr(settings, "LOG_JSON", True)
    monkeypatch.setattr(log, "LOG_PATH", tmp_path)
    log.setup_logging()
    log.set_custom_logfile(enqueue=False)
    yield tmp_path, output
    log.logger.complete()
    log.logger.remove()
    log._owned_handlers.clear()


@pytest.mark.parametrize(
    "case",
    [
        "renderer",
        "in_app",
        "recall",
        "banner",
        "admin_enqueue",
        "admin_recall",
        "enqueue",
        "scheduled",
        "banner_transition",
    ],
)
async def test_notification_failure_paths_keep_types_without_raw_values(case, production_files):
    from plugin_notification import tasks
    from plugin_notification.admin.services import AdminNotificationService
    from plugin_notification.banner.services import BannerAnnouncementService
    from plugin_notification.channels import InAppChannel
    from plugin_notification.models import NotificationTemplate
    from plugin_notification.recall import broadcast_recall
    from plugin_notification.renderer import TemplateRenderer
    from plugin_notification.services import NotificationService
    from rapidkit_common.protocols.notification import AudienceRule, NotificationCommand

    private = "synthetic-private-notification-credential"
    error = RuntimeError(private)
    fail = AsyncMock(side_effect=error)
    uid = uuid4()
    context = AsyncMock()
    session = AsyncMock()
    context.__aenter__.return_value = session

    def enqueue():
        raise error

    if case == "renderer":
        template = NotificationTemplate(
            code="privacy",
            name="privacy",
            category="privacy",
            enabled=True,
            content_mode="raw",
            title_template="{value:{style}}",
            content_template="fixed",
            variable_schema={"value": {"type": "string"}, "style": {"type": "string"}},
        )
        with pytest.raises(AppException):
            TemplateRenderer().render(template, {"value": "fixed", "style": private})
    elif case == "in_app":
        result = await InAppChannel(sio_factory=lambda: SimpleNamespace(emit=fail)).deliver(
            redis=None, user_id=uid, payload={"id": "safe-id"}
        )
        assert result.success is False and result.error_code == "inapp_emit_failed"
    elif case == "recall":
        session.exec.return_value = SimpleNamespace(all=lambda: [uid])
        assert await broadcast_recall(session, uid, sio_factory=lambda: SimpleNamespace(emit=fail)) == 0
    elif case == "banner":
        await BannerAnnouncementService(broadcaster=fail).broadcast(1)
    elif case == "admin_enqueue":
        AdminNotificationService(enqueue_delivery=enqueue).enqueue_delivery()
    elif case == "admin_recall":
        await AdminNotificationService(recall_broadcaster=fail)._broadcast_recall(uid)
    elif case == "enqueue":
        result = SimpleNamespace(deduplicated=False, message_id=uid, recipient_count=1)
        with patch("plugin_notification.services.MessageOrchestrator") as orchestrator:
            orchestrator.return_value.process = AsyncMock(return_value=result)
            service = NotificationService(
                session_factory=lambda: context, query_service=AsyncMock(), enqueue_delivery=enqueue
            )
            command = NotificationCommand(
                source="privacy",
                category="privacy",
                raw_title="fixed",
                raw_content="fixed",
                audience=[AudienceRule(type="all")],
            )
            assert await service.send(command) is result
        session.commit.assert_awaited_once()
    elif case == "scheduled":
        session.begin_nested = lambda: context
        with patch.object(tasks.MessageCRUD, "get_due_scheduled", AsyncMock(return_value=[SimpleNamespace(id=uid)])):
            orchestrator = AsyncMock()
            orchestrator.publish_message = fail
            assert await tasks._publish_due(session, orchestrator) == 0
    else:
        lock = SimpleNamespace(acquire=AsyncMock(return_value=True), release=AsyncMock())
        with (
            patch.object(tasks, "DistributedLock", return_value=lock),
            patch.object(tasks.BannerAnnouncementService, "advance_due", fail),
            patch.object(tasks, "_publish_due", AsyncMock(return_value=0)),
        ):
            await tasks.publish_scheduled_notifications.run(redis=object(), session=lambda: context)
        lock.release.assert_awaited_once()

    log.logger.complete()
    directory, output = production_files
    stdout = output.getvalue()
    assert private not in stdout
    files = "".join(path.read_text() for path in directory.glob("*.log"))
    assert private not in files
    warnings = [json.loads(line) for line in stdout.splitlines() if json.loads(line)["level"] == "WARNING"]
    assert warnings
    assert any(
        "ValueError" in (row["exception"] or "")
        if case == "renderer"
        else row.get("exception_type") == "RuntimeError" or "RuntimeError" in (row["exception"] or "")
        for row in warnings
    )
