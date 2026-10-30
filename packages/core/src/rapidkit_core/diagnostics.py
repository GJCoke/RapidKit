"""Safe diagnostic copies; execution payloads never pass through these helpers."""

import json
import traceback
from collections.abc import Mapping
from typing import Any


def exception_summary(error: BaseException | None) -> str:
    """Keep types and frame locations, excluding values, locals and source lines."""
    if error is None:
        return "Exception: [Filtered]"
    lines = ["Traceback (most recent call last):"]
    pending, seen = [error], set()
    while pending and len(seen) < 20:
        current = pending.pop()
        if id(current) in seen:
            continue
        seen.add(id(current))
        frames = traceback.extract_tb(current.__traceback__, limit=-100)
        lines.extend(f'  File "{frame.filename}", line {frame.lineno}, in {frame.name}' for frame in frames)
        lines.append(f"{type(current).__name__}: [Filtered]")
        pending.extend(getattr(current, "exceptions", ())[:10])
        cause = current.__cause__ or (current.__context__ if not current.__suppress_context__ else None)
        if cause is not None:
            pending.append(cause)
    return "\n".join(lines).encode()[:65536].decode("utf-8", errors="ignore")


def task_diagnostics(data: Mapping[str, Any]) -> dict[str, Any]:
    """Unknown task data is denied, including historical observer payloads."""
    fields = {
        "task_id",
        "task_name",
        "request_id",
        "user_id",
        "actor_id",
        "impersonation_session_id",
        "audit_correlation_id",
        "correlation_id",
        "hostname",
        "group_name",
        "deployment_id",
        "state",
        "timestamp",
        "attempt",
        "terminated",
        "expired",
        "concurrency",
        "runtime",
    }
    safe: dict[str, Any] = {
        key: value
        for key, value in data.items()
        if key in fields and isinstance(value, (str, int, float, bool, type(None)))
    }
    for key, value in safe.items():
        if isinstance(value, str):
            safe[key] = value.encode()[:256].decode("utf-8", errors="ignore")
    safe.update(args=[], kwargs={}, retval=None, logs=None, diagnostic_truncated=True)
    if "exception" in data or "exception_type" in data:
        kind = data.get("exception_type")
        safe["exception"] = kind if isinstance(kind, str) and len(kind) <= 128 and kind.isidentifier() else "Exception"
        safe["exception_type"] = safe["exception"]
        safe["traceback"] = None
    frames = data.get("traceback_frames")
    if isinstance(frames, list):
        safe["traceback_frames"] = [
            {"filename": frame["filename"][:1024], "name": frame["name"][:256], "lineno": frame["lineno"]}
            for frame in frames[:100]
            if isinstance(frame, dict)
            and isinstance(frame.get("filename"), str)
            and isinstance(frame.get("name"), str)
            and isinstance(frame.get("lineno"), int)
        ]
        safe["traceback"] = (
            "\n".join(
                f'File "{frame["filename"]}", line {frame["lineno"]}, in {frame["name"]}'
                for frame in safe["traceback_frames"]
            )
            or None
        )
    identity = data.get("audit_initiated_by")
    if isinstance(identity, dict):
        safe["audit_initiated_by"] = {
            key: identity[key][:128]
            for key in ("user_id", "actor_id", "impersonation_session_id")
            if isinstance(identity.get(key), str)
        }
    info = data.get("software_info")
    if isinstance(info, dict):
        safe["software_info"] = {
            key: str(info[key])[:256]
            for key in ("celery_version", "python_version", "platform")
            if key in info and isinstance(info[key], str)
        }
    if len(json.dumps(safe, ensure_ascii=False).encode()) > 16384:
        safe.pop("traceback_frames", None)
        safe["traceback"] = None
    if len(json.dumps(safe, ensure_ascii=False).encode()) > 16384:
        safe = {
            key: value.encode()[:64].decode("utf-8", errors="ignore") if isinstance(value, str) else value
            for key, value in safe.items()
            if value is None or isinstance(value, str) or isinstance(value, (int, float)) and abs(value) < 2**63
        }
        safe.update(args=[], kwargs={}, retval=None, logs=None)
    return safe
