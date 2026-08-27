def test_deliver_renders_and_sends(monkeypatch) -> None:
    from plugin_auth.invite import tasks

    sent: dict = {}

    class Sender:
        def send(self, to: str, subject: str, html: str) -> None:
            sent.update(to=to, subject=subject, html=html)

    monkeypatch.setattr(tasks, "build_email_sender", lambda: Sender())
    tasks._deliver("to@example.com", "Alice", "https://app/login/set-password?token=t")
    assert sent["to"] == "to@example.com"
    assert "Alice" in sent["html"]
    assert "token=t" in sent["html"]
