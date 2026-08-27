"""Invite email rendering and SMTP delivery."""

import html
import smtplib
from email.message import EmailMessage

from rapidkit_core.log import get_plugin_logger

logger = get_plugin_logger("Auth")


def render_invite_email(user_name: str, invite_link: str) -> tuple[str, str]:
    """Render a safe HTML invite message."""
    safe_name = html.escape(user_name)
    safe_link = html.escape(invite_link, quote=True)
    subject = "You have been invited — set your password"
    body = (
        f"<p>Hi {safe_name},</p>"
        "<p>An account has been created for you. Set your password using the link below.</p>"
        f'<p><a href="{safe_link}">Set your password</a></p>'
        "<p>This link expires in 48 hours and can only be used once.</p>"
    )
    return subject, body


class EmailSender:
    """Small SMTP adapter used by the delivery task."""

    def __init__(self, *, host: str, port: int, user: str, password: str, sender: str, use_tls: bool) -> None:
        self._host = host
        self._port = port
        self._user = user
        self._password = password
        self._sender = sender
        self._use_tls = use_tls

    def send(self, to: str, subject: str, html_body: str) -> None:
        if not self._host:
            logger.warning("SMTP host not configured; skipping invite email to {to}", to=to)
            return
        message = EmailMessage()
        message["Subject"] = subject
        message["From"] = self._sender
        message["To"] = to
        message.set_content("Please view this email in an HTML-capable client.")
        message.add_alternative(html_body, subtype="html")
        with smtplib.SMTP(self._host, self._port) as server:
            if self._use_tls:
                server.starttls()
            if self._user:
                server.login(self._user, self._password)
            server.send_message(message)
