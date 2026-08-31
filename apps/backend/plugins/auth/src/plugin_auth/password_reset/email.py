"""Password-reset email rendering."""

import html


def render_password_reset_email(user_name: str, reset_link: str) -> tuple[str, str]:
    """Render a safe, reset-specific HTML message."""
    safe_name = html.escape(user_name)
    safe_link = html.escape(reset_link, quote=True)
    subject = "Reset your RapidKit password"
    body = (
        f"<p>Hi {safe_name},</p>"
        "<p>We received a request to reset your password.</p>"
        f'<p><a href="{safe_link}">Reset your password</a></p>'
        "<p>This link uses the configured password-link expiry and can only be used once.</p>"
        "<p>If you did not request this, you can ignore this email.</p>"
    )
    return subject, body
