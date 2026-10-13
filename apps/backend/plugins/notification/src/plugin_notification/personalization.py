"""Persisted recipient rendering configuration and immutable delivery snapshots."""

from copy import deepcopy
from dataclasses import asdict

from rapidkit_common.protocols.notification import RecipientVariableBinding
from rapidkit_common.protocols.user import UserPublicProfile
from rapidkit_framework.exceptions import AppException

from plugin_notification.models import NotificationMessage, NotificationTemplate, UserNotification
from plugin_notification.renderer import RenderedContent, TemplateRenderer
from plugin_notification.status_codes import NotificationStatusCode
from plugin_notification.validation import validate_json_shape


def _with_optional_strings(schema: dict, variables: dict) -> dict:
    """Supply empty optional text values without changing required or typed values."""
    cleaned = dict(variables)
    for name, rule in schema.items():
        if (
            isinstance(rule, dict)
            and not rule.get("required", False)
            and rule.get("type", "string") == "string"
            and cleaned.get(name) is None
        ):
            cleaned[name] = ""
    return cleaned


def prepare_personalization(
    template: NotificationTemplate,
    variables: dict,
    bindings: dict[str, RecipientVariableBinding],
) -> tuple[RenderedContent, dict | None]:
    """Validate bindings and manual input without querying recipient values."""
    renderer = TemplateRenderer()
    schema = template.variable_schema
    validate_json_shape(schema)
    validate_json_shape(variables)
    if bindings.keys() & variables.keys() or bindings.keys() - schema.keys():
        raise AppException(NotificationStatusCode.TEMPLATE_VARIABLE_INVALID)
    for name in bindings:
        if not isinstance(schema[name], dict) or schema[name].get("type", "string") != "string":
            raise AppException(NotificationStatusCode.TEMPLATE_VARIABLE_INVALID)
    # Placeholders retain the original intent in the shared administrative draft.
    render_variables = {**variables, **{name: "{" + name + "}" for name in bindings}}
    if bindings:
        render_variables = _with_optional_strings(schema, render_variables)
    rendered = renderer.render(template, render_variables)
    if not bindings:
        return rendered, None
    config = {
        "template": {
            key: getattr(template, key)
            for key in (
                "code",
                "name",
                "category",
                "content_mode",
                "title_template",
                "content_template",
                "content_format",
                "variable_schema",
            )
        },
        "variables": variables,
        "bindings": {name: binding.model_dump() for name, binding in bindings.items()},
    }
    # The wrapper is built exclusively from validated components. Template text
    # keeps the existing content limits; manual data and schema keep their JSON
    # limits. Counting wrapper bytes/keys/depth would reject legal templates.
    for binding in config["bindings"].values():
        validate_json_shape(binding)
    return rendered, deepcopy(config)


def render_personalized(config: dict, profile: UserPublicProfile | None) -> RenderedContent:
    """Resolve only whitelisted public fields against the saved template text."""
    template = NotificationTemplate(**config["template"], enabled=True)
    variables = dict(config["variables"])
    errors = []
    for name, raw_binding in config["bindings"].items():
        binding = RecipientVariableBinding.model_validate(raw_binding)
        value = getattr(profile, binding.field) if profile is not None else ""
        if template.variable_schema[name].get("required", False) and not value.strip():
            errors.append(
                {"name": name, "source": "recipient", "field": binding.field, "reason": "required_value_missing"}
            )
        variables[name] = value
    if errors:
        raise AppException(NotificationStatusCode.TEMPLATE_VARIABLE_INVALID, data={"variableErrors": errors})
    return TemplateRenderer().render(template, _with_optional_strings(template.variable_schema, variables))


def resolve_recipient_content(message: NotificationMessage, inbox: UserNotification | None) -> RenderedContent:
    """Use the durable recipient snapshot; legacy rows retain shared content."""
    if inbox is not None and inbox.rendered_content is not None:
        return RenderedContent(**inbox.rendered_content)
    return RenderedContent(
        content_mode=message.content_mode,
        title=message.title,
        content=message.content,
        content_params=message.content_params,
        content_format=message.content_format,
    )


def content_snapshot(rendered: RenderedContent) -> dict:
    return asdict(rendered)
