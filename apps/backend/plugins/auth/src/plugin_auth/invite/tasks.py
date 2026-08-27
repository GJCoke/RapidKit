"""Celery task for invite email delivery."""

from rapidkit_core.log import get_plugin_logger
from src.queues.app import app

from plugin_auth.invite.email import render_invite_email
from plugin_auth.invite.service import build_email_sender

logger = get_plugin_logger("Auth")


def _deliver(email: str, user_name: str, invite_link: str) -> None:
    subject, html_body = render_invite_email(user_name, invite_link)
    build_email_sender().send(email, subject, html_body)


@app.task(name="send_invite_email", bind=True, max_retries=3)
def send_invite_email(self, email: str, user_name: str, invite_link: str) -> None:
    try:
        _deliver(email, user_name, invite_link)
    except Exception as exc:
        logger.warning("Invite email delivery failed for {email}: {err}", email=email, err=str(exc))
        raise self.retry(exc=exc, countdown=60)
