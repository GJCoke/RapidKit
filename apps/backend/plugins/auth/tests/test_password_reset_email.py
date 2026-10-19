from plugin_auth.password_reset.email import render_password_reset_email


def test_reset_email_escapes_user_controlled_content() -> None:
    subject, body = render_password_reset_email(
        "RapidKit",
        "Alice <Admin>",
        "https://app.example/login/reset-password?token=a&b",
    )

    assert subject == "【RapidKit】重置登录密码"
    assert "Alice &lt;Admin&gt;" in body
    assert "token=a&amp;b" in body
    assert "仅可使用一次" in body
    assert "忽略本邮件" in body
