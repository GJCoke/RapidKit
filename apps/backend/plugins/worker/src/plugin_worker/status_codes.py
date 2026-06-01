"""
Worker plugin status codes (plugin_id=05).

6-digit format: 05TNNN
- T=2: business errors
- T=5: resource not found errors
"""

from rapidkit_framework.status_codes import BaseStatusCode


class WorkerStatusCode(BaseStatusCode):
    """Worker plugin error codes."""

    # Business errors (052xxx)
    TASK_TRIGGER_FAILED = (52001, "worker.error.taskTriggerFailed")
    TASK_REVOKE_FAILED = (52002, "worker.error.taskRevokeFailed")
    TASK_NOT_REGISTERED = (52003, "worker.error.taskNotRegistered")
    WORKER_CONTROL_FAILED = (52004, "worker.error.workerControlFailed")
    WORKER_OFFLINE = (52005, "worker.error.workerOffline")
    TASK_RETRY_NOT_ALLOWED = (52006, "worker.error.taskRetryNotAllowed")

    # Resource not found (055xxx)
    WORKER_NOT_FOUND = (55001, "worker.error.workerNotFound")
    TASK_NOT_FOUND = (55002, "worker.error.taskNotFound")
