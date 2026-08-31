from plugin_auth.password_reset.email import render_password_reset_email


def test_reset_email_escapes_user_controlled_content() -> None:
    subject, body = render_password_reset_email(
        "Alice <Admin>",
        "https://app.example/login/reset-password?token=a&b",
    )

    assert subject == "Reset your RapidKit password"
    assert "Alice &lt;Admin&gt;" in body
    assert "token=a&amp;b" in body
    assert "only be used once" in body
    assert "ignore this email" in body
