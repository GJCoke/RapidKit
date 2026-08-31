def test_deliver_reset_email_uses_shared_sender(monkeypatch) -> None:
    from plugin_auth.password_reset import tasks

    sent: dict[str, str] = {}

    class Sender:
        def send(self, to: str, subject: str, html_body: str) -> None:
            sent.update(to=to, subject=subject, html=html_body)

    monkeypatch.setattr(tasks, "build_email_sender", lambda: Sender())

    tasks._deliver("to@example.com", "Alice", "https://app/login/reset-password?token=t")

    assert sent["to"] == "to@example.com"
    assert "token=t" in sent["html"]
