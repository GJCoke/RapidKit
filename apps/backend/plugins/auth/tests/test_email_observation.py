import asyncio
import json
import socketserver
import threading
import time
from smtplib import SMTPServerDisconnected

import pytest


async def test_real_smtp_timeout_keeps_safe_dependency_and_request_context(monkeypatch):
    from plugin_auth.invite.email import EmailSender
    from rapidkit_core import log
    from rapidkit_core.config import settings
    from rapidkit_core.nanoid import request_id_scope

    class Handler(socketserver.StreamRequestHandler):
        def handle(self):
            time.sleep(0.1)
            try:
                self.wfile.write(b"220 synthetic SMTP\r\n")
            except OSError:
                pass

    server = socketserver.ThreadingTCPServer(("127.0.0.1", 0), Handler)
    server.daemon_threads = True
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    sender = EmailSender(
        host="127.0.0.1",
        port=server.server_address[1],
        user="private-user",
        password="private-password",
        sender="private-sender@example.com",
        use_tls=False,
    )
    monkeypatch.setattr(settings, "DEPENDENCY_SLOW_THRESHOLD_MS", 1)
    log.setup_logging()
    records = []
    handler = log.logger.add(lambda message: records.append(json.loads(message.record["extra"]["_json"])))
    try:
        with request_id_scope("abcdefghijklmnopqrstu"):
            with pytest.raises(SMTPServerDisconnected):
                await asyncio.to_thread(
                    sender.send, "private-recipient@example.com", "private-subject", "private-body", timeout=0.02
                )
        row = next(row for row in records if row.get("component") == "smtp")
        assert row["operation"] == "send" and row["outcome"] == "error" and row["retryable"] is True
        assert row["request_id"] == "abcdefghijklmnopqrstu"
        assert "private-" not in json.dumps(records) and "@example.com" not in json.dumps(records)
    finally:
        log.logger.remove(handler)
        server.shutdown()
        server.server_close()
        thread.join(2)
