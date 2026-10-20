"""Exact announcement text and structured-payload limits."""

import pytest
from plugin_notification.admin.schemas import ActionIn, AnnouncementCreateRequest
from plugin_notification.models import NotificationTemplate
from plugin_notification.renderer import TemplateRenderer
from plugin_notification.status_codes import NotificationStatusCode
from plugin_notification.validation import validate_content, validate_json_shape
from pydantic import ValidationError
from rapidkit_framework.exceptions import AppException


@pytest.mark.parametrize("character", ["x", "中", "😀"], ids=["ascii", "chinese", "emoji"])
@pytest.mark.parametrize("length", [1, 255, 256])
def test_raw_title_accepts_character_boundaries(character, length):
    title = character * length
    body = AnnouncementCreateRequest(raw_title=title, raw_content="Body", audience=[{"type": "all"}])
    assert body.raw_title == title


@pytest.mark.parametrize("character", ["x", "中", "😀"], ids=["ascii", "chinese", "emoji"])
def test_raw_title_rejects_257_characters(character):
    with pytest.raises(ValidationError) as exc:
        AnnouncementCreateRequest(raw_title=character * 257, raw_content="Body", audience=[{"type": "all"}])
    assert any(error["loc"] == ("raw_title",) and error["type"] == "string_too_long" for error in exc.value.errors())


@pytest.mark.parametrize("character", ["x", "中", "😀"], ids=["ascii", "chinese", "emoji"])
@pytest.mark.parametrize("length", [1, 19_999, 20_000])
def test_raw_body_accepts_full_character_limit_not_utf8_byte_limit(character, length):
    validate_content(character * length, content_format="plain_text")


@pytest.mark.parametrize("character", ["x", "中", "😀"], ids=["ascii", "chinese", "emoji"])
def test_raw_body_rejects_one_character_over_limit(character):
    with pytest.raises(AppException) as exc:
        validate_content(character * 20_001, content_format="plain_text")
    assert exc.value.status_code_enum is NotificationStatusCode.INVALID_COMMAND


@pytest.mark.parametrize("length", [127, 128])
def test_category_accepts_boundary(length):
    body = AnnouncementCreateRequest(
        category="x" * length, raw_title="Title", raw_content="Body", audience=[{"type": "all"}]
    )
    assert body.category == "x" * length


def test_category_rejects_one_character_over_limit():
    with pytest.raises(ValidationError):
        AnnouncementCreateRequest(category="x" * 129, raw_title="Title", raw_content="Body", audience=[{"type": "all"}])


@pytest.mark.parametrize("field,limit", [("label", 64), ("url", 2048)])
def test_action_schema_accepts_limit_and_rejects_one_more(field, limit):
    assert getattr(ActionIn(**{field: "x" * limit}), field) == "x" * limit
    with pytest.raises(ValidationError) as exc:
        ActionIn(**{field: "x" * (limit + 1)})
    assert exc.value.errors()[0]["type"] == "string_too_long"


@pytest.mark.parametrize(
    "payload,valid",
    [
        ({"text": "x" * 16_372}, True),  # JSON wrapper adds 12 UTF-8 bytes: exactly 16,384.
        ({"text": "x" * 16_373}, False),
        ({"text": "中" * 5457}, True),  # 16,383 UTF-8 bytes, despite only 5,457 characters.
        ({"text": "中" * 5458}, False),
        ({f"k{i}": i for i in range(64)}, True),
        ({f"k{i}": i for i in range(65)}, False),
        ({"items": list(range(64))}, True),
        ({"items": list(range(65))}, False),
        ({"a": {"b": {"c": {"d": 1}}}}, True),
        ({"a": {"b": {"c": {"d": {"e": 1}}}}}, False),
    ],
    ids=[
        "bytes-at",
        "bytes-over",
        "chinese-under",
        "chinese-over",
        "keys-at",
        "keys-over",
        "array-at",
        "array-over",
        "depth-at",
        "depth-over",
    ],
)
def test_json_exact_bounds(payload, valid):
    if valid:
        validate_json_shape(payload)
    else:
        with pytest.raises(AppException) as exc:
            validate_json_shape(payload)
        assert exc.value.status_code_enum is NotificationStatusCode.INVALID_COMMAND


def _template(title, content):
    return NotificationTemplate(
        code="length-boundary",
        name="Length boundary",
        category="admin.announcement",
        content_mode="raw",
        title_template=title,
        content_template=content,
        variable_schema={"value": {"type": "string", "required": True}},
        enabled=True,
    )


@pytest.mark.parametrize("length", [255, 256])
def test_template_rendered_title_accepts_boundary(length):
    rendered = TemplateRenderer().render(_template("{value}", "Body"), {"value": "中" * length})
    assert rendered.title == "中" * length


def test_template_rendered_title_rejects_overflow_after_substitution():
    with pytest.raises(AppException) as exc:
        TemplateRenderer().render(_template("Notice {value}", "Body"), {"value": "x" * 250})
    assert exc.value.status_code_enum is NotificationStatusCode.INVALID_COMMAND


def test_template_literal_title_rejects_overflow_before_database_write():
    with pytest.raises(AppException) as exc:
        TemplateRenderer().render(_template("x" * 257, "{value}"), {"value": "Body"})
    assert exc.value.status_code_enum is NotificationStatusCode.INVALID_COMMAND


@pytest.mark.parametrize("length,valid", [(19_998, True), (20_000, True), (20_002, False)])
def test_template_body_checks_rendered_length_after_repeated_parameter(length, valid):
    # A short template and a legal parameter object can still expand beyond the text limit.
    template = _template("Title", "{value}{value}")
    value = "x" * (length // 2)
    if valid:
        assert TemplateRenderer().render(template, {"value": value}).content == "x" * length
    else:
        with pytest.raises(AppException) as exc:
            TemplateRenderer().render(template, {"value": value})
        assert exc.value.status_code_enum is NotificationStatusCode.INVALID_COMMAND
