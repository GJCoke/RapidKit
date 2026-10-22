"""Shared audit snapshots; transaction and HTTP adapters use the same record."""

import time
from collections.abc import Awaitable, Callable
from contextvars import ContextVar
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import ConfigDict, Field, model_validator
from rapidkit_core.timezone import timezone
from rapidkit_core.transaction import after_commit
from rapidkit_core.uuid7 import uuid7
from rapidkit_framework.audit import AuditActorType, AuditResult, AuditRiskLevel, AuditSource
from sqlalchemy import event, inspect
from sqlalchemy.orm import Session
from sqlmodel import select
from starlette.requests import Request

from rapidkit_common.schemas.base import BaseModel
from rapidkit_common.scope_runtime import apply_field_rules


def is_sensitive_audit_field(name: str) -> bool:
    normalized = "".join(c for c in name.casefold() if c.isalnum())
    return any(
        normalized.endswith(suffix)
        for suffix in (
            "password",
            "token",
            "secret",
            "key",
            "authorization",
            "cookie",
            "verificationcode",
        )
    )


class AuditChange(BaseModel):
    field: str
    before: Any = None
    after: Any = None
    before_display: str | None = Field(default=None, max_length=200)
    after_display: str | None = Field(default=None, max_length=200)
    redacted: bool = False

    @model_validator(mode="after")
    def redact_secret(self):
        if self.redacted or is_sensitive_audit_field(self.field):
            self.before = self.after = None
            self.before_display = self.after_display = None
            self.redacted = True
        return self


class AuditTarget(BaseModel):
    resource_type: str = Field(max_length=50)
    resource_id: str = Field(max_length=100)
    resource_name: str | None = Field(default=None, max_length=200)
    result: AuditResult = AuditResult.UNKNOWN
    error_message: str | None = Field(default=None, max_length=1024)


class AuditBatch(BaseModel):
    requested: int = Field(ge=0)
    affected: int = Field(default=0, ge=0)
    succeeded: int = Field(default=0, ge=0)
    failed: int = Field(default=0, ge=0)


class AuditMetadata(BaseModel):
    model_config = ConfigDict(extra="forbid")
    subject_name: str | None = None
    subject_username: str | None = None
    reason: str | None = None
    end_reason: str | None = None
    changes: list[AuditChange] = Field(default_factory=list)
    batch: AuditBatch | None = None
    initiated_by: dict[str, str | None] | None = None
    task_id: str | None = None
    attempt: int | None = Field(default=None, ge=0)
    attempted_username: str | None = None
    identity_snapshots: dict[str, str | None] = Field(default_factory=dict)


class AuditRecord(BaseModel):
    id: UUID = Field(default_factory=uuid7)
    actor_type: AuditActorType = AuditActorType.UNKNOWN
    actor_id: UUID | None = None
    actor_name: str | None = Field(default=None, max_length=100)
    actor_username: str | None = Field(default=None, max_length=100)
    subject_user_id: UUID | None = None
    impersonation_session_id: UUID | None = None
    action: str = Field(max_length=100)
    resource_type: str | None = Field(default=None, max_length=50)
    resource_id: str | None = Field(default=None, max_length=100)
    resource_name: str | None = Field(default=None, max_length=200)
    result: AuditResult = AuditResult.UNKNOWN
    risk_level: AuditRiskLevel = AuditRiskLevel.NORMAL
    source: AuditSource = AuditSource.HTTP
    request_id: str | None = Field(default=None, max_length=100)
    correlation_id: str | None = Field(default=None, max_length=100)
    ip: str | None = Field(default=None, max_length=45)
    user_agent: str | None = Field(default=None, max_length=500)
    http_method: str | None = Field(default=None, max_length=10)
    path: str | None = Field(default=None, max_length=500)
    request_summary: dict | None = None
    response_code: int | None = None
    business_code: int | None = None
    error_key: str | None = Field(default=None, max_length=150)
    error_message: str | None = Field(default=None, max_length=1024)
    duration_ms: float | None = Field(default=None, ge=0)
    metadata: AuditMetadata = Field(default_factory=AuditMetadata)
    targets: list[AuditTarget] = Field(default_factory=list, exclude=True)
    occurred_at: datetime = Field(default_factory=timezone.now)

    def persistence_data(self) -> dict:
        data = self.model_dump(exclude={"metadata", "targets"})
        data["extra_data"] = self.metadata.model_dump(mode="json", exclude_none=True)
        return data


@dataclass
class AuditContext:
    record: AuditRecord = field(default_factory=lambda: AuditRecord(action="http.request"))
    started: float = field(default_factory=time.monotonic)
    confirmed: bool = False
    deferred: bool = False
    committed: bool = False
    transactional: bool = False
    excluded: bool = False
    action_def: Any = None
    publish: Callable[[AuditRecord], Awaitable[None]] | None = None
    identity_provider: Callable[[], dict] | None = None
    captured: dict[str, dict] = field(default_factory=dict)

    def confirm(self, result: AuditResult = AuditResult.SUCCESS) -> None:
        self.record.result = result
        self.confirmed = True

    def snapshot(self) -> AuditRecord:
        record = self.record.model_copy(deep=True)
        record.duration_ms = max(0, (time.monotonic() - self.started) * 1000)
        if self.captured and (len(self.captured) > 1 or record.action.endswith(".batch-delete")):
            record.resource_id = None
            record.resource_name = None
            count = len(self.captured)
            success = record.result == AuditResult.SUCCESS
            record.metadata.batch = AuditBatch(
                requested=count,
                affected=count if success else 0,
                succeeded=count if success else 0,
                failed=0 if success else count,
            )
            record.targets = [
                AuditTarget(
                    resource_type=record.resource_type or "unknown",
                    resource_id=value["id"],
                    resource_name=value["name"],
                    result=record.result,
                )
                for value in self.captured.values()
            ]
        if record.metadata.batch is not None and record.result == AuditResult.FAILURE:
            record.metadata.batch.affected = 0
            record.metadata.batch.succeeded = 0
            record.metadata.batch.failed = record.metadata.batch.requested
        if record.result not in (AuditResult.SUCCESS, AuditResult.PARTIAL):
            record.metadata.changes = []
        return record


def get_audit_context(request: Request) -> AuditContext | None:
    return getattr(request.state, "audit_context", None)


current_audit: ContextVar[AuditContext | None] = ContextVar("current_business_audit", default=None)


def bind_audit_routes(router, declarations: dict) -> list:
    actions = {}
    for route in router.routes:
        if not (getattr(route, "methods", set()) & {"POST", "PUT", "PATCH", "DELETE"}):
            continue
        if route.endpoint.__name__ not in declarations:
            continue
        definition = declarations[route.endpoint.__name__]
        extra = dict(route.openapi_extra or {})
        extra["x-audit"] = {"action": definition.code} if definition is not None else {"exclude": True}
        route.openapi_extra = extra
        if definition is not None:
            actions[definition.code] = definition
    return list(actions.values())


def capture_audit_model(session, model, before: dict | None, after: dict | None) -> None:
    context = current_audit.get()
    if context is None or context.action_def is None or type(model) is not context.action_def.model:
        return
    definition = context.action_def
    values = before if before is not None else after
    if values is None:
        return
    object_id = str(values["id"])
    name = values.get(definition.name_field)
    context.captured.setdefault(object_id, {"id": object_id, "name": str(name)[:200] if name else None})
    if context.captured[object_id]["name"] is None and name:
        context.captured[object_id]["name"] = str(name)[:200]
    context.record.resource_id = object_id
    context.record.resource_name = context.captured[object_id]["name"]
    privilege_changed = after is not None and (
        bool((before or {}).get("is_admin")) != bool(after.get("is_admin"))
        or ("roles" in definition.fields and set((before or {}).get("roles") or []) != set(after.get("roles") or []))
    )
    if privilege_changed:
        context.record.risk_level = AuditRiskLevel.CRITICAL
        context.transactional = True
    for key in definition.fields:
        previous, following = (before or {}).get(key), (after or {}).get(key)
        if previous != following:
            change = AuditChange(field=key, before=previous, after=following)
            existing = next((item for item in context.record.metadata.changes if item.field == key), None)
            if existing:
                existing.after = change.after
            else:
                context.record.metadata.changes.append(change)
    if context.record.action == "schedule.toggle" and after is not None:
        context.record.action = "schedule.enable" if after.get("enabled") else "schedule.disable"
    session.info["_audit_prepare"] = lambda async_session: prepare_audit_commit(async_session, context)
    session.info["_audit_rollback"] = lambda exc: context.confirm(AuditResult.FAILURE)
    context.deferred = True


async def prepare_audit_commit(session, context: AuditContext) -> None:
    if context.identity_provider:
        for key, value in context.identity_provider().items():
            setattr(context.record, key, value)
    for change in context.record.metadata.changes:
        reference = context.action_def.reference_fields.get(change.field) if context.action_def else None
        if not reference or change.redacted:
            continue
        model, name_field = reference
        for side in ("before", "after"):
            value = getattr(change, side)
            if value is None:
                continue
            try:
                reference_id = UUID(str(value))
            except ValueError:
                continue
            # Use the request session so reference names respect its row scopes.
            item = (await session.exec(select(model).where(getattr(model, "id") == reference_id))).one_or_none()
            name = getattr(item, name_field, None) if item is not None else None
            name = apply_field_rules({name_field: name}, model).get(name_field)
            if name is not None:
                setattr(change, f"{side}_display", str(name)[:200])
    context.confirm()
    record = context.snapshot()

    async def mark_committed():
        context.committed = True

    after_commit(session, mark_committed)
    if context.action_def and (context.action_def.transactional or context.transactional):
        from rapidkit_framework.services import get_service

        from rapidkit_common.protocols.audit import AuditWriter

        record.duration_ms = None  # Commit time cannot be known by an immutable row in that same transaction.
        await get_service(AuditWriter).append_in_transaction(session, record)
        context.transactional = True
    elif context.publish:
        publisher = context.publish

        async def publish_committed():
            record.duration_ms = max(0, (time.monotonic() - context.started) * 1000)
            await publisher(record)

        after_commit(session, publish_committed)


@event.listens_for(Session, "before_flush")
def _capture_declared_audit_model(session, flush_context, instances):
    context = current_audit.get()
    if context is None or context.action_def is None:
        return
    for model in tuple(session.new) + tuple(session.dirty) + tuple(session.deleted):
        if type(model) is not context.action_def.model:
            continue
        values = model.model_dump(mode="json")
        before = None if model in session.new else dict(values)
        after = None if model in session.deleted else values
        if before is not None and after is not None:
            state = inspect(model)
            for name in context.action_def.fields:
                history = state.attrs[name].history if name in state.attrs else None
                if history is not None and history.deleted:
                    before[name] = history.deleted[0]
        capture_audit_model(session, model, before, after)
