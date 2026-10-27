"""Task audit action declarations."""

from rapidkit_common.audit import bind_audit_routes
from rapidkit_framework.audit import AuditActionDef, AuditRiskLevel


def configure_audit(router):
    submit = AuditActionDef("task.submit", "audit.actions.task.submit", "task", "audit.resources.task")
    revoke = AuditActionDef(
        "task.revoke", "audit.actions.task.revoke", "task", "audit.resources.task", id_parameter="task_id"
    )
    declarations = {"trigger_task_endpoint": submit, "revoke_task_endpoint": revoke, "ping_worker_endpoint": None}
    for endpoint, command in (
        ("shutdown_worker_endpoint", "send-shutdown"),
        ("retire_worker_endpoint", "retire"),
        ("pool_grow_endpoint", "grow-pool"),
        ("pool_shrink_endpoint", "shrink-pool"),
        ("add_queue_endpoint", "add-consumer"),
        ("cancel_queue_endpoint", "cancel-consumer"),
    ):
        declarations[endpoint] = AuditActionDef(
            f"worker.{command}",
            f"audit.actions.worker.{command}",
            "worker",
            "audit.resources.worker",
            risk_level=AuditRiskLevel.SENSITIVE,
            id_parameter="worker_id",
            fields={"n": "audit.fields.n", "queue": "audit.fields.queue"},
        )
    actions = bind_audit_routes(router, declarations)
    actions.append(AuditActionDef("task.execute", "audit.actions.task.execute", "task", "audit.resources.task"))
    return actions
