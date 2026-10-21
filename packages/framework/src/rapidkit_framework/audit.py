"""Stable audit vocabulary and plugin-owned business action declarations."""

import re
from dataclasses import dataclass, field
from enum import StrEnum


class AuditResult(StrEnum):
    SUCCESS = "success"
    FAILURE = "failure"
    PARTIAL = "partial"
    UNKNOWN = "unknown"


class AuditRiskLevel(StrEnum):
    NORMAL = "normal"
    SENSITIVE = "sensitive"
    CRITICAL = "critical"


class AuditSource(StrEnum):
    HTTP = "http"
    DOMAIN_EVENT = "domain_event"
    SYSTEM = "system"


class AuditActorType(StrEnum):
    USER = "user"
    SYSTEM = "system"
    ANONYMOUS = "anonymous"
    UNKNOWN = "unknown"


@dataclass(frozen=True)
class AuditActionDef:
    code: str
    label_key: str
    resource_type: str
    resource_label_key: str
    risk_level: AuditRiskLevel = AuditRiskLevel.NORMAL
    fields: dict[str, str] = field(default_factory=dict)
    transactional: bool = False
    model: type | None = None
    name_field: str = "name"
    id_parameter: str | None = None

    def __post_init__(self) -> None:
        if not re.fullmatch(r"[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*", self.code):
            raise ValueError("Audit action must be resource.business-action")
        if not re.fullmatch(r"[a-z][a-z0-9-]*", self.resource_type):
            raise ValueError("Invalid audit resource type")
