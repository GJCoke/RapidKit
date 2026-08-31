"""Celery task for password-reset email delivery."""

from rapidkit_core.log import get_plugin_logger
from src.queues.app import app

from plugin_auth.invite.service import build_email_sender
from plugin_auth.password_reset.email import render_password_reset_email

logger = get_plugin_logger("Auth")


def _deliver(email: str, user_name: str, reset_link: str) -> None:
    subject, html_body = render_password_reset_email(user_name, reset_link)
    build_email_sender().send(email, subject, html_body)


@app.task(name="send_password_reset_email", bind=True, max_retries=3)
def send_password_reset_email(self, email: str, user_name: str, reset_link: str) -> None:
    try:
        _deliver(email, user_name, reset_link)
    except Exception as exc:
        logger.warning("Password reset email delivery failed: {err}", err=str(exc))
        raise self.retry(exc=exc, countdown=60)
