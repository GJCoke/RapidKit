"""Notification payload boundary tests."""

import pytest
from plugin_notification.status_codes import NotificationStatusCode
from plugin_notification.validation import (
    validate_action,
    validate_content,
    validate_i18n_key,
    validate_json_shape,
)
from rapidkit_framework.exceptions import AppException


def _assert_rejected(call, status=NotificationStatusCode.INVALID_COMMAND):
    with pytest.raises(AppException) as exc_info:
        call()
    assert exc_info.value.status_code_enum is status


@pytest.mark.parametrize("value", ["<b>unsafe</b>", "hello <script>alert(1)</script>"])
def test_plain_text_rejects_html(value: str) -> None:
    _assert_rejected(
        lambda: validate_content(value, content_format="plain_text"),
        NotificationStatusCode.CONTENT_HTML_NOT_ALLOWED,
    )


@pytest.mark.parametrize(
    ("value", "status"),
    [
        ("![x](https://example.com/x.png)", NotificationStatusCode.INVALID_COMMAND),
        ("[x](javascript:alert(1))", NotificationStatusCode.INVALID_COMMAND),
        ("<iframe>x</iframe>", NotificationStatusCode.CONTENT_HTML_NOT_ALLOWED),
    ],
)
def test_markdown_rejects_unsafe_constructs(value: str, status: NotificationStatusCode) -> None:
    _assert_rejected(lambda: validate_content(value, content_format="markdown"), status)


def test_i18n_key_requires_stable_dotted_identifier() -> None:
    _assert_rejected(lambda: validate_i18n_key("javascript:alert(1)"))


def test_action_rejects_unknown_route_and_nested_params() -> None:
    _assert_rejected(
        lambda: validate_action({"route": "https://example.com", "params": {}}),
        NotificationStatusCode.INVALID_ACTION_ROUTE,
    )
    _assert_rejected(lambda: validate_action({"route": "notification_center", "params": {"next": {"x": 1}}}))


def test_json_shape_rejects_excessive_depth() -> None:
    _assert_rejected(lambda: validate_json_shape({"a": {"b": {"c": {"d": {"e": 1}}}}}))
