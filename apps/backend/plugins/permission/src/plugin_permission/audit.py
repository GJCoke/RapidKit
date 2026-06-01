"""
Structured audit logging for RBAC/ABAC decisions.

Uses the project's Loguru-based logger with a dedicated name
for filtering and routing audit events.

Author : Coke
Date   : 2026-05-08
"""

from uuid import UUID

from rapidkit_core.log import get_plugin_logger

audit_logger = get_plugin_logger("RBACaudit")


def log_data_policy_result(
    *,
    user_id: UUID,
    model: str,
    endpoint: str,
    method: str,
    policies_evaluated: list[UUID],
    result: str,
    reason: str,
) -> None:
    """Log a structured ABAC evaluation result."""
    if result == "denied":
        audit_logger.warning(
            "ABAC {result}: user_id={user_id} model={model} endpoint={method} {endpoint} "
            "policies={policies} reason={reason}",
            result=result,
            user_id=str(user_id),
            model=model,
            method=method,
            endpoint=endpoint,
            policies=[str(p) for p in policies_evaluated],
            reason=reason,
        )
    else:
        audit_logger.info(
            "ABAC {result}: user_id={user_id} model={model} policies_count={count}",
            result=result,
            user_id=str(user_id),
            model=model,
            count=len(policies_evaluated),
        )
