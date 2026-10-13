"""Render notification templates into safe content snapshots."""

from dataclasses import dataclass

from rapidkit_core.log import get_plugin_logger
from rapidkit_framework.exceptions import AppException

from plugin_notification.models import NotificationTemplate
from plugin_notification.status_codes import NotificationStatusCode
from plugin_notification.validation import validate_content, validate_i18n_key, validate_json_shape

logger = get_plugin_logger("Notification")

_TYPE_MAP: dict[str, tuple[type, ...]] = {
    "string": (str,),
    "integer": (int,),
    "number": (int, float),
    "boolean": (bool,),
}


@dataclass
class RenderedContent:
    """Validated content snapshot produced from a notification template."""

    content_mode: str
    title: str
    content: str
    content_params: dict | None
    content_format: str | None


class TemplateRenderer:
    """Validate declared variables and render safe notification content."""

    def validate_variables(self, schema: dict, variables: dict) -> dict:
        """Return declared, type-safe variables or reject the complete input."""
        if not isinstance(schema, dict) or not isinstance(variables, dict):
            raise AppException(NotificationStatusCode.TEMPLATE_VARIABLE_INVALID)

        undeclared_names = variables.keys() - schema.keys()
        if undeclared_names:
            logger.warning("Template variables include names not declared by the schema")
            raise AppException(NotificationStatusCode.TEMPLATE_VARIABLE_INVALID)

        cleaned: dict = {}
        for name, rule in schema.items():
            if not isinstance(rule, dict):
                raise AppException(NotificationStatusCode.TEMPLATE_VARIABLE_INVALID)

            required = bool(rule.get("required", False))
            declared_type = rule.get("type", "string")
            if not isinstance(declared_type, str):
                raise AppException(NotificationStatusCode.TEMPLATE_VARIABLE_INVALID)
            expected = _TYPE_MAP.get(declared_type)
            if expected is None:
                logger.warning("Template variable {} has unsupported declared type", name)
                raise AppException(NotificationStatusCode.TEMPLATE_VARIABLE_INVALID)

            if name not in variables or variables[name] is None:
                if required:
                    logger.warning("Missing required template variable: {}", name)
                    raise AppException(NotificationStatusCode.TEMPLATE_VARIABLE_INVALID)
                continue

            value = variables[name]
            if declared_type in ("integer", "number") and isinstance(value, bool):
                logger.warning("Template variable {} type mismatch: expected {}", name, declared_type)
                raise AppException(NotificationStatusCode.TEMPLATE_VARIABLE_INVALID)
            if not isinstance(value, expected):
                logger.warning("Template variable {} type mismatch: expected {}", name, declared_type)
                raise AppException(NotificationStatusCode.TEMPLATE_VARIABLE_INVALID)
            cleaned[name] = value

        return cleaned

    def render(self, template: NotificationTemplate, variables: dict) -> RenderedContent:
        """Render raw text or preserve i18n keys after validating content."""
        if not template.enabled:
            raise AppException(NotificationStatusCode.TEMPLATE_DISABLED)

        cleaned = self.validate_variables(template.variable_schema, variables)
        validate_json_shape(cleaned)

        if template.content_mode == "raw":
            try:
                title = template.title_template.format(**cleaned)
                content = template.content_template.format(**cleaned)
            except (AttributeError, IndexError, KeyError, TypeError, ValueError) as exc:
                logger.warning("Template raw render failed: {}", exc)
                raise AppException(NotificationStatusCode.TEMPLATE_VARIABLE_INVALID) from exc

            if len(title) > 256:
                raise AppException(NotificationStatusCode.INVALID_COMMAND)
            validate_content(title, content_format="plain_text")
            validate_content(content, content_format=template.content_format or "plain_text")
            return RenderedContent(
                content_mode="raw",
                title=title,
                content=content,
                content_params=None,
                content_format=template.content_format or "plain_text",
            )

        if template.content_mode == "i18n":
            validate_i18n_key(template.title_template)
            validate_i18n_key(template.content_template)
            return RenderedContent(
                content_mode="i18n",
                title=template.title_template,
                content=template.content_template,
                content_params=cleaned,
                content_format=None,
            )

        raise AppException(NotificationStatusCode.TEMPLATE_VARIABLE_INVALID)
