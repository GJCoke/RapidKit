"""Central validation for notification content and structured payloads."""

import json
import math
import re
from typing import Any

from rapidkit_framework.exceptions import AppException

from plugin_notification.status_codes import NotificationStatusCode

MAX_JSON_BYTES = 16_384
MAX_JSON_DEPTH = 4
MAX_JSON_KEYS = 64
MAX_ARRAY_LENGTH = 64
MAX_CONTENT_LENGTH = 20_000

_HTML_TAG_RE = re.compile(r"</?[a-zA-Z][^>]*>")
_I18N_KEY_RE = re.compile(r"^[a-z][a-zA-Z0-9]*(?:[._-][a-zA-Z0-9]+)+$")
_ROUTE_RE = re.compile(r"^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$", re.IGNORECASE)
_MARKDOWN_IMAGE_RE = re.compile(r"!\[[^]]*]\([^)]*\)")
_MARKDOWN_LINK_RE = re.compile(r"\[[^]]+]\([^)]*\)")

ALLOWED_ACTION_ROUTES = frozenset(
    {
        "home",
        "notification_center",
        "notification_preferences",
        "user_center",
    }
)


def _invalid(status: NotificationStatusCode = NotificationStatusCode.INVALID_COMMAND) -> None:
    raise AppException(status)


def validate_json_shape(value: Any) -> None:
    """Reject non-JSON values and structures too large to safely persist."""
    key_count = 0

    def visit(item: Any, depth: int) -> None:
        nonlocal key_count
        if depth > MAX_JSON_DEPTH:
            _invalid()
        if item is None or isinstance(item, (str, bool, int)):
            return
        if isinstance(item, float):
            if not math.isfinite(item):
                _invalid()
            return
        if isinstance(item, list):
            if len(item) > MAX_ARRAY_LENGTH:
                _invalid()
            for child in item:
                visit(child, depth + 1)
            return
        if isinstance(item, dict):
            key_count += len(item)
            if key_count > MAX_JSON_KEYS or any(not isinstance(key, str) for key in item):
                _invalid()
            for child in item.values():
                visit(child, depth + 1)
            return
        _invalid()

    visit(value, 0)
    try:
        encoded = json.dumps(value, ensure_ascii=False, allow_nan=False).encode()
    except (TypeError, ValueError):
        _invalid()
    if len(encoded) > MAX_JSON_BYTES:
        _invalid()


def validate_content(value: str, *, content_format: str) -> None:
    if not isinstance(value, str) or len(value) > MAX_CONTENT_LENGTH:
        _invalid()
    if _HTML_TAG_RE.search(value):
        _invalid(NotificationStatusCode.CONTENT_HTML_NOT_ALLOWED)
    if content_format == "markdown" and (
        _MARKDOWN_IMAGE_RE.search(value)
        or _MARKDOWN_LINK_RE.search(value)
        or "javascript:" in value.lower()
        or "data:" in value.lower()
    ):
        _invalid()


def validate_i18n_key(value: str) -> None:
    if _HTML_TAG_RE.search(value):
        _invalid(NotificationStatusCode.CONTENT_HTML_NOT_ALLOWED)
    if not _I18N_KEY_RE.fullmatch(value):
        _invalid()


def validate_action(action: dict[str, Any] | None) -> None:
    if action is None:
        return
    route = action.get("route")
    if not isinstance(route, str) or not _ROUTE_RE.fullmatch(route) or route not in ALLOWED_ACTION_ROUTES:
        _invalid(NotificationStatusCode.INVALID_ACTION_ROUTE)
    params = action.get("params", {})
    if not isinstance(params, dict):
        _invalid()
    for value in params.values():
        if not isinstance(value, (str, bool, int, float)) or isinstance(value, float) and not math.isfinite(value):
            _invalid()
    validate_json_shape(params)
