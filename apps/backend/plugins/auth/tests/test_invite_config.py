from datetime import timedelta

from plugin_auth.invite.config import invite_settings


def test_invite_defaults() -> None:
    assert invite_settings.INVITE_TOKEN_EXP == timedelta(hours=48)
    assert invite_settings.FRONTEND_BASE_URL
    assert invite_settings.SMTP_PORT == 587
