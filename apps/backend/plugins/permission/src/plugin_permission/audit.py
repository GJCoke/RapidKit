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


def log_data_scope_result(
    *,
    user_id: UUID,
    resource: str,
    endpoint: str,
    method: str,
    scope_keys: list[str],
    result: str,
) -> None:
    """Log the data scope bound to a request."""
    audit_logger.info(
        "Data scope {result}: user_id={user_id} resource={resource} scopes={scopes} endpoint={method} {endpoint}",
        result=result,
        user_id=str(user_id),
        resource=resource,
        scopes=scope_keys,
        method=method,
        endpoint=endpoint,
    )


def log_permission_denied(
    *,
    user_id: UUID,
    code: str,
    route_key: str,
    role_versions: dict[str, int],
    catalog_version: int,
) -> None:
    """Log a structured RBAC denial (missing permission code)."""
    audit_logger.warning(
        "RBAC denied: user_id={user_id} code={code} route={route_key} "
        "role_versions={role_versions} catalog_version={catalog_version}",
        user_id=str(user_id),
        code=code,
        route_key=route_key,
        role_versions=role_versions,
        catalog_version=catalog_version,
    )
