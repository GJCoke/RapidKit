from plugin_auth.invite.email import EmailSender, render_invite_email


def test_render_invite_email_contains_escaped_name_and_link() -> None:
    subject, html = render_invite_email("Alice <Admin>", "https://app.example/login/set-password?token=a&b")
    assert "Alice &lt;Admin&gt;" in html
    assert "token=a&amp;b" in html
    assert subject


def test_send_skips_when_smtp_host_empty(monkeypatch) -> None:
    called = False

    def fail(*args, **kwargs):
        nonlocal called
        called = True

    monkeypatch.setattr("plugin_auth.invite.email.smtplib.SMTP", fail)
    EmailSender(host="", port=587, user="", password="", sender="x@y.z", use_tls=True).send(
        "to@example.com", "subject", "<p>hi</p>"
    )
    assert called is False
