"""Keep Celery's protocol disposition while exposing only safe message identifiers."""

from contextlib import contextmanager

from celery.worker.consumer.consumer import Consumer
from rapidkit_core.log import logger


@contextmanager
def _message_context(message):
    headers = message.headers if isinstance(message.headers, dict) else {}
    identifiers = {}
    for source, target, limit in (("id", "task_id", 100), ("task", "task_name", 255)):
        value = headers.get(source)
        identifiers[target] = value if isinstance(value, str) and 0 < len(value) <= limit else None
    with logger.contextualize(**identifiers):
        yield


class SafeConsumer(Consumer):
    def on_unknown_task(self, body, message, exc):
        with _message_context(message):
            return super().on_unknown_task(body, message, exc)

    def on_unknown_message(self, body, message):
        with _message_context(message):
            return super().on_unknown_message(body, message)

    def on_invalid_task(self, body, message, exc):
        with _message_context(message):
            return super().on_invalid_task(body, message, exc)

    def on_decode_error(self, message, exc):
        with _message_context(message):
            return super().on_decode_error(message, exc)
