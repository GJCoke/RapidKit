"""Cross-plugin contracts for the notification system.

Business plugins depend only on this module's ``Notifier`` protocol and
``NotificationCommand``; they never import notification plugin internals.
"""

from __future__ import annotations

import re
from datetime import datetime
from decimal import Decimal
from typing import Annotated, Literal, Protocol, runtime_checkable
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StrictBool, StrictFloat, StrictInt, StrictStr, model_validator

from rapidkit_common.schemas.base import BaseModel as CamelCaseModel

NotificationLevel = Literal["info", "success", "warning", "error"]
AudienceType = Literal["user", "role", "department", "all"]
ContentMode = Literal["template", "i18n", "raw", "local"]
ContentFormat = Literal["plain_text", "markdown"]
NotificationChannel = Literal["in_app"]
NotificationLocale = Literal["zh-CN", "en-US"]
LocalizedParameter = StrictStr | StrictInt | StrictFloat | StrictBool

_LOCALIZED_PARAMETER_RE = re.compile(r"\{([A-Za-z_][A-Za-z0-9_]*)\}")
_LOCALIZED_PARAMETER_NAME_RE = re.compile(r"[A-Za-z_][A-Za-z0-9_]*")


def _localized_parameter_text(value: LocalizedParameter) -> str:
    """Use browser boolean and decimal/exponent conventions for text snapshots."""
    if isinstance(value, bool):
        return str(value).lower()
    if isinstance(value, float):
        if value == 0:
            return "0"
        if 1e-6 <= abs(value) < 1e21:
            text = format(Decimal(str(value)), "f")
            return text.rstrip("0").rstrip(".") if "." in text else text
        coefficient, exponent = str(value).split("e")
        return f"{coefficient.removesuffix('.0')}e{int(exponent):+d}"
    return str(value)


class LocalizedTranslation(CamelCaseModel):
    """One author-provided language; an optional language may be entirely blank."""

    model_config = ConfigDict(extra="forbid")

    title: str = Field(default="", max_length=256)
    content: str = Field(default="", max_length=20_000)


class LocalizedContent(CamelCaseModel):
    """Portable language envelope stored intact in existing notification JSON."""

    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)

    default_locale: NotificationLocale
    translations: dict[NotificationLocale, LocalizedTranslation]
    parameters: dict[str, LocalizedParameter] = Field(default_factory=dict)

    @model_validator(mode="after")
    def _validate_localized(self) -> LocalizedContent:
        complete = {}
        referenced: set[str] = set()
        for locale, translation in self.translations.items():
            has_title = bool(translation.title.strip())
            has_content = bool(translation.content.strip())
            if not has_title and not has_content and locale != self.default_locale:
                continue
            if not has_title or not has_content:
                raise ValueError(f"{locale} requires both title and content")
            complete[locale] = translation
            referenced.update(_LOCALIZED_PARAMETER_RE.findall(translation.title))
            referenced.update(_LOCALIZED_PARAMETER_RE.findall(translation.content))
        if self.default_locale not in complete:
            raise ValueError("default locale requires a complete translation")
        if any(not _LOCALIZED_PARAMETER_NAME_RE.fullmatch(name) for name in self.parameters):
            raise ValueError("localized parameter names must be ASCII identifiers")
        missing = sorted(
            name
            for name in referenced
            if name not in self.parameters or isinstance(value := self.parameters[name], str) and not value.strip()
        )
        if missing:
            raise ValueError(f"missing localized parameters: {', '.join(missing)}")
        self.translations = complete
        return self

    def render(self, locale: NotificationLocale) -> tuple[str, str]:
        """Replace named placeholders once, without interpreting expressions."""
        translation = self.translations[locale]

        def replace(match: re.Match[str]) -> str:
            return _localized_parameter_text(self.parameters[match.group(1)])

        return (
            _LOCALIZED_PARAMETER_RE.sub(replace, translation.title),
            _LOCALIZED_PARAMETER_RE.sub(replace, translation.content),
        )


def _default_channels() -> list[NotificationChannel]:
    return ["in_app"]


class RecipientVariableBinding(BaseModel):
    """A supported public recipient field, never an expression."""

    model_config = ConfigDict(extra="forbid")

    source: Literal["recipient"]
    field: Literal["name", "email", "roles", "department"]


class LocalizedActionLabel(CamelCaseModel):
    """Author-provided button names, independent of the shared navigation target."""

    model_config = ConfigDict(extra="forbid")

    default_locale: NotificationLocale
    translations: dict[NotificationLocale, Annotated[StrictStr, Field(max_length=64)]]

    @model_validator(mode="after")
    def _validate_translations(self) -> LocalizedActionLabel:
        self.translations = {locale: text.strip() for locale, text in self.translations.items() if text.strip()}
        if self.default_locale not in self.translations:
            raise ValueError("default locale requires a button label")
        return self


class NotificationAction(BaseModel):
    """A menu binding, external link, or legacy controlled route."""

    type: Literal["menu", "external"] | None = None
    menu_id: UUID | None = None
    route: str | None = Field(default=None, min_length=1, max_length=128)
    params: dict = Field(default_factory=dict)
    query: dict = Field(default_factory=dict)
    url: str | None = Field(default=None, max_length=2048)
    path: str | None = Field(default=None, max_length=2048)
    label: str | None = Field(default=None, max_length=64)
    localized_label: LocalizedActionLabel | None = None


class AudienceRule(BaseModel):
    """A single audience rule for user, role, department, or all users."""

    type: AudienceType
    value: str | None = None
    include_descendants: bool = False

    @model_validator(mode="after")
    def _validate_shape(self) -> AudienceRule:
        if self.type == "all":
            if self.value is not None or self.include_descendants:
                raise ValueError("all audience does not accept value or include_descendants")
        elif not self.value:
            raise ValueError("user, role, and department audiences require value")
        elif self.type != "department" and self.include_descendants:
            raise ValueError("include_descendants is valid only for department audiences")
        if self.type in {"user", "department"} and self.value:
            try:
                UUID(self.value)
            except ValueError as exc:
                raise ValueError(f"{self.type} audience value must be a UUID") from exc
        return self


class NotificationCommand(BaseModel):
    """The normalized notification command submitted by a business plugin."""

    source: str = Field(..., min_length=1, max_length=64)
    category: str = Field(..., min_length=1, max_length=128)
    level: NotificationLevel = "info"

    i18n_key: str | None = Field(default=None, max_length=256)
    i18n_params: dict = Field(default_factory=dict)

    localized_content: LocalizedContent | None = None

    raw_title: str | None = Field(default=None, max_length=256)
    raw_content: str | None = None
    raw_format: ContentFormat = "plain_text"

    template_code: str | None = Field(default=None, max_length=128)
    template_variables: dict = Field(default_factory=dict)
    variable_bindings: dict[str, RecipientVariableBinding] = Field(default_factory=dict)

    audience: list[AudienceRule] = Field(default_factory=list)
    mandatory: bool = False
    channels: list[NotificationChannel] = Field(default_factory=_default_channels)
    action: NotificationAction | None = None

    deduplication_key: str | None = Field(default=None, max_length=256)
    meta: dict | None = None

    @property
    def content_mode(self) -> ContentMode:
        if self.template_code is not None:
            return "template"
        if self.localized_content is not None:
            return "local"
        return "i18n" if self.i18n_key is not None else "raw"

    @model_validator(mode="after")
    def _validate(self) -> NotificationCommand:
        has_template = self.template_code is not None
        has_i18n = self.i18n_key is not None
        has_raw = self.raw_title is not None or self.raw_content is not None
        has_localized = self.localized_content is not None
        provided = sum((has_template, has_i18n, has_raw, has_localized))
        if provided > 1:
            raise ValueError("content sources are mutually exclusive: provide one of template / i18n / raw / local")
        if provided == 0:
            raise ValueError(
                "missing content source: provide template_code / i18n_key / raw content / localized_content"
            )
        if has_raw and (self.raw_title is None or self.raw_content is None):
            raise ValueError("raw mode requires both raw_title and raw_content")
        if self.variable_bindings and not has_template:
            raise ValueError("recipient bindings require a template")
        if not self.audience:
            raise ValueError("audience must not be empty")
        if not self.channels:
            raise ValueError("channels must not be empty")
        return self


class NotificationResult(BaseModel):
    """The result of processing a notification command."""

    message_id: UUID
    recipient_count: int
    deduplicated: bool = False


@runtime_checkable
class Notifier(Protocol):
    """The notification service protocol provided by plugin_notification."""

    async def send(self, command: NotificationCommand) -> NotificationResult: ...


class AudiencePreview(BaseModel):
    """An estimated audience breakdown, not a publication authorization."""

    total: int
    by_type: dict[str, int] = Field(default_factory=dict)


@runtime_checkable
class AdminNotifier(Protocol):
    """The administrative notification service provided by the notification plugin."""

    async def create_message(
        self,
        command: NotificationCommand,
        *,
        created_by: UUID,
        publish_at: datetime | None = None,
        expire_at: datetime | None = None,
    ) -> NotificationResult: ...

    async def publish(self, message_id: UUID, *, operator_id: UUID) -> NotificationResult: ...

    async def cancel(self, message_id: UUID, *, operator_id: UUID) -> None: ...

    async def recall(self, message_id: UUID, *, operator_id: UUID) -> None: ...

    async def preview_audience(self, audience: list[AudienceRule]) -> AudiencePreview: ...
