"""TemplateRenderer tests."""

import pytest
from plugin_notification.models import NotificationTemplate
from plugin_notification.renderer import RenderedContent, TemplateRenderer
from plugin_notification.status_codes import NotificationStatusCode
from rapidkit_framework.exceptions import AppException


def _raw_template(**overrides: object) -> NotificationTemplate:
    values = {
        "code": "account.summary",
        "name": "Account summary",
        "category": "account",
        "level": "info",
        "content_mode": "raw",
        "title_template": "Hi {username}",
        "content_template": "You have {count} messages",
        "content_format": "plain_text",
        "variable_schema": {
            "username": {"type": "string", "required": True},
            "count": {"type": "integer", "required": True},
        },
        "default_channels": ["in_app"],
        "default_action": None,
        "mandatory": False,
        "enabled": True,
        "version": 1,
    }
    values.update(overrides)
    return NotificationTemplate(**values)


def _i18n_template(**overrides: object) -> NotificationTemplate:
    values = {
        "code": "user.invited",
        "name": "User invited",
        "category": "user",
        "level": "info",
        "content_mode": "i18n",
        "title_template": "notification.user.invitedTitle",
        "content_template": "notification.user.invitedBody",
        "content_format": None,
        "variable_schema": {"username": {"type": "string", "required": True}},
        "default_channels": ["in_app"],
        "default_action": None,
        "mandatory": False,
        "enabled": True,
        "version": 1,
    }
    values.update(overrides)
    return NotificationTemplate(**values)


def _assert_status(exc_info: pytest.ExceptionInfo[AppException], status: NotificationStatusCode) -> None:
    assert exc_info.value.status_code_enum is status


def test_render_raw_substitutes_declared_variables() -> None:
    rendered = TemplateRenderer().render(_raw_template(), {"username": "alice", "count": 3})

    assert isinstance(rendered, RenderedContent)
    assert rendered.content_mode == "raw"
    assert rendered.title == "Hi alice"
    assert rendered.content == "You have 3 messages"
    assert rendered.content_params is None
    assert rendered.content_format == "plain_text"


def test_render_i18n_keeps_keys_and_validated_params() -> None:
    rendered = TemplateRenderer().render(_i18n_template(), {"username": "alice"})

    assert rendered.content_mode == "i18n"
    assert rendered.title == "notification.user.invitedTitle"
    assert rendered.content == "notification.user.invitedBody"
    assert rendered.content_params == {"username": "alice"}
    assert rendered.content_format is None


def test_render_rejects_missing_required_variable() -> None:
    with pytest.raises(AppException) as exc_info:
        TemplateRenderer().render(_raw_template(), {"username": "alice"})

    _assert_status(exc_info, NotificationStatusCode.TEMPLATE_VARIABLE_INVALID)


@pytest.mark.parametrize(
    ("variables", "variable_schema"),
    [
        (
            {"username": "alice", "count": "3"},
            {
                "username": {"type": "string", "required": True},
                "count": {"type": "integer", "required": True},
            },
        ),
        (
            {"username": "alice", "count": True},
            {
                "username": {"type": "string", "required": True},
                "count": {"type": "integer", "required": True},
            },
        ),
        (
            {"username": "alice", "count": False},
            {
                "username": {"type": "string", "required": True},
                "count": {"type": "number", "required": True},
            },
        ),
    ],
    ids=["wrong-type", "bool-is-not-integer", "bool-is-not-number"],
)
def test_render_rejects_invalid_declared_variable_types(
    variables: dict[str, object],
    variable_schema: dict[str, dict[str, object]],
) -> None:
    with pytest.raises(AppException) as exc_info:
        TemplateRenderer().render(
            _raw_template(variable_schema=variable_schema),
            variables,
        )

    _assert_status(exc_info, NotificationStatusCode.TEMPLATE_VARIABLE_INVALID)


@pytest.mark.parametrize(
    ("field", "template_value"),
    [
        ("title_template", "Hi {username.missing}"),
        ("content_template", "You have {count[x]} messages"),
    ],
    ids=["missing-attribute", "invalid-item-access"],
)
def test_render_maps_raw_format_access_errors_to_invalid_variable(
    field: str,
    template_value: str,
) -> None:
    with pytest.raises(AppException) as exc_info:
        TemplateRenderer().render(
            _raw_template(**{field: template_value}),
            {"username": "alice", "count": 3},
        )

    _assert_status(exc_info, NotificationStatusCode.TEMPLATE_VARIABLE_INVALID)


@pytest.mark.parametrize("declared_type", [["string"], {"kind": "string"}], ids=["list", "dict"])
def test_render_rejects_non_string_declared_type(declared_type: object) -> None:
    with pytest.raises(AppException) as exc_info:
        TemplateRenderer().render(
            _raw_template(
                variable_schema={
                    "username": {"type": declared_type, "required": True},
                    "count": {"type": "integer", "required": True},
                }
            ),
            {"username": "alice", "count": 3},
        )

    _assert_status(exc_info, NotificationStatusCode.TEMPLATE_VARIABLE_INVALID)


def test_render_rejects_variables_not_declared_by_schema() -> None:
    with pytest.raises(AppException) as exc_info:
        TemplateRenderer().render(
            _raw_template(),
            {"username": "alice", "count": 3, "is_admin": True},
        )

    _assert_status(exc_info, NotificationStatusCode.TEMPLATE_VARIABLE_INVALID)


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("title_template", "Hi <b>{username}</b>"),
        ("content_template", "<script>alert(1)</script> {username}"),
    ],
)
def test_render_rejects_html_in_rendered_raw_fields(field: str, value: str) -> None:
    with pytest.raises(AppException) as exc_info:
        TemplateRenderer().render(
            _raw_template(**{field: value}),
            {"username": "alice", "count": 1},
        )

    _assert_status(exc_info, NotificationStatusCode.CONTENT_HTML_NOT_ALLOWED)


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("title_template", "<b>notification.user.invitedTitle</b>"),
        ("content_template", "<script>notification.user.invitedBody</script>"),
    ],
)
def test_render_rejects_html_in_i18n_keys(field: str, value: str) -> None:
    with pytest.raises(AppException) as exc_info:
        TemplateRenderer().render(
            _i18n_template(**{field: value}),
            {"username": "alice"},
        )

    _assert_status(exc_info, NotificationStatusCode.CONTENT_HTML_NOT_ALLOWED)


def test_render_rejects_disabled_template() -> None:
    with pytest.raises(AppException) as exc_info:
        TemplateRenderer().render(
            _raw_template(enabled=False),
            {"username": "alice", "count": 1},
        )

    _assert_status(exc_info, NotificationStatusCode.TEMPLATE_DISABLED)
