"""Structured notification audit logging without message content or variables."""

from uuid import UUID

from rapidkit_core.log import get_plugin_logger

logger = get_plugin_logger("Notification")


def audit(
    action: str,
    *,
    operator_id: UUID,
    target_id: UUID,
    correlation_id: str | None = None,
    audience_summary: str | None = None,
    banner_revision: int | None = None,
    previous_active_id: UUID | None = None,
    previous_scheduled_id: UUID | None = None,
) -> None:
    """Record only stable identifiers and audience-type metadata."""
    logger.warning(
        "AUDIT notification action={} user_id={} target_id={} correlation_id={} audience={} "
        "banner_revision={} previous_active_id={} previous_scheduled_id={}",
        action,
        operator_id,
        target_id,
        correlation_id,
        audience_summary,
        banner_revision,
        previous_active_id,
        previous_scheduled_id,
    )
