"""
Schedule plugin status codes (plugin_id=07).

6-digit format: 07TNNN
- T=1: parameter errors
- T=5: resource not found errors
"""

from rapidkit_framework.status_codes import BaseStatusCode


class ScheduleStatusCode(BaseStatusCode):
    """Schedule plugin error codes."""

    # Parameter errors (071xxx)
    INTERVAL_DATA_REQUIRED = (71001, "schedule.error.intervalDataRequired")
    CRONTAB_DATA_REQUIRED = (71002, "schedule.error.crontabDataRequired")
    UNSUPPORTED_TASK_TYPE = (71003, "schedule.error.unsupportedTaskType")

    # Resource not found (075xxx)
    TASK_NOT_FOUND = (75001, "schedule.error.taskNotFound")
