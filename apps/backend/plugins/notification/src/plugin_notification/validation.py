"""Central validation for notification content and structured payloads."""

import json
import math
import re
import unicodedata
from ipaddress import ip_address
from typing import Any, NoReturn
from urllib.parse import urlsplit
from uuid import UUID

from pydantic import ValidationError
from rapidkit_common.protocols.notification import LocalizedActionLabel, LocalizedContent
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


def _invalid(status: NotificationStatusCode = NotificationStatusCode.INVALID_COMMAND) -> NoReturn:
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
    except TypeError, ValueError:
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


def validate_localized_content(localized: LocalizedContent) -> tuple[str, str, dict]:
    """Validate every authored and substituted locale before storing its envelope."""
    envelope = localized.model_dump(mode="json", by_alias=True)
    validate_json_shape(envelope)
    rendered = {}
    for locale, translation in localized.translations.items():
        validate_content(translation.title, content_format="plain_text")
        validate_content(translation.content, content_format="plain_text")
        title, content = localized.render(locale)
        if len(title) > 256:
            _invalid()
        validate_content(title, content_format="plain_text")
        validate_content(content, content_format="plain_text")
        rendered[locale] = (title, content)
    title, content = rendered[localized.default_locale]
    return title, content, envelope


def validate_external_url(url: Any) -> None:
    """Allow only credential-free HTTP(S) URLs with a valid host."""
    if (
        not isinstance(url, str)
        or len(url) > 2048
        or any(c.isspace() or unicodedata.category(c) == "Cc" for c in url)
        or "\\" in url
    ):
        _invalid(NotificationStatusCode.INVALID_ACTION_ROUTE)
    try:
        parsed = urlsplit(url)
        if (
            parsed.scheme.lower() not in {"http", "https"}
            or not parsed.hostname
            or parsed.username is not None
            or parsed.password is not None
        ):
            _invalid(NotificationStatusCode.INVALID_ACTION_ROUTE)
        host = parsed.hostname
        _ = parsed.port
        try:
            ip_address(host)
        except ValueError:
            ascii_host = host.encode("idna").decode().rstrip(".")
            if len(ascii_host) > 253 or any(
                not re.fullmatch(r"[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?", label)
                for label in ascii_host.split(".")
            ):
                _invalid(NotificationStatusCode.INVALID_ACTION_ROUTE)
    except ValueError, UnicodeError:
        _invalid(NotificationStatusCode.INVALID_ACTION_ROUTE)


def validate_action(action: dict[str, Any] | None) -> None:
    if action is None:
        return
    if not isinstance(action, dict):
        _invalid()
    action_type = action.get("type")
    if action_type == "external":
        validate_external_url(action.get("url"))
    elif action_type == "menu":
        try:
            UUID(str(action.get("menu_id")))
        except ValueError, TypeError:
            _invalid(NotificationStatusCode.INVALID_ACTION_ROUTE)
    elif action_type is None:
        route = action.get("route")
        if not isinstance(route, str) or not _ROUTE_RE.fullmatch(route) or route not in ALLOWED_ACTION_ROUTES:
            _invalid(NotificationStatusCode.INVALID_ACTION_ROUTE)
    else:
        _invalid(NotificationStatusCode.INVALID_ACTION_ROUTE)
    for field in ("params", "query"):
        values = action.get(field, {})
        if not isinstance(values, dict):
            _invalid()
        for value in values.values():
            if not isinstance(value, (str, bool, int, float)) or isinstance(value, float) and not math.isfinite(value):
                _invalid()
        validate_json_shape(values)
    label = action.get("label")
    if label is not None and (not isinstance(label, str) or len(label) > 64):
        _invalid()
    localized_label = action.get("localized_label")
    if localized_label is not None:
        try:
            LocalizedActionLabel.model_validate(localized_label)
        except ValidationError:
            _invalid()
