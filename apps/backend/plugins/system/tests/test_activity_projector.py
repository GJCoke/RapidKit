"""Tests for explicit domain-event to activity projections."""

from plugin_system.activity_projector import project_activity
from plugin_system.models import ActivityCategory, ActivityLevel
from rapidkit_common.events import (
    PluginLoadFailedEvent,
    TaskFailedEvent,
    TaskSucceededEvent,
    UserLoginEvent,
    WorkerOfflineEvent,
)
from rapidkit_core.timezone import timezone


def test_login_projects_to_natural_user_activity():
    projection = project_activity(
        UserLoginEvent(
            user_id="018f5f8a-71a7-7b10-9e18-aad0de52c010",
            event_id="event-login",
            occurred_at=timezone.now(),
            actor_name="Coke",
        )
    )
    assert projection.category is ActivityCategory.USER
    assert projection.level is ActivityLevel.INFO
    assert projection.title_key == "page.home.dashboard.activity.userLogin"
    assert projection.title_params == {"actor": "Coke"}


def test_task_success_projects_to_task_activity():
    projection = project_activity(
        TaskSucceededEvent(
            event_id="event-task",
            occurred_at=timezone.now(),
            task_id="task-1",
            task_name="daily-sync",
            runtime=12.4,
        )
    )
    assert projection.category is ActivityCategory.TASK
    assert projection.level is ActivityLevel.SUCCESS
    assert projection.title_params == {"task": "daily-sync", "duration": 12.4}


def test_task_failure_stays_in_task_category():
    projection = project_activity(
        TaskFailedEvent(
            event_id="event-task-failure",
            occurred_at=timezone.now(),
            task_id="task-2",
            task_name="daily-sync",
            error_summary="timeout",
        )
    )
    assert projection.category is ActivityCategory.TASK
    assert projection.level is ActivityLevel.ERROR
    assert projection.title_key == "page.home.dashboard.activity.taskFailed"


def test_worker_offline_is_system_not_alert():
    projection = project_activity(
        WorkerOfflineEvent(event_id="event-worker", occurred_at=timezone.now(), worker_hostname="worker-1")
    )
    assert projection.category is ActivityCategory.SYSTEM
    assert projection.level is ActivityLevel.WARNING


def test_plugin_load_failure_is_alert():
    projection = project_activity(
        PluginLoadFailedEvent(
            event_id="event-plugin",
            occurred_at=timezone.now(),
            plugin_name="worker",
            error_summary="import failed",
        )
    )
    assert projection.category is ActivityCategory.ALERT
    assert projection.level is ActivityLevel.ERROR
