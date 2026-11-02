import inspect
import json
import logging
import os
import re
import socket
import stat
import sys
import time
import traceback
from datetime import date, datetime
from enum import Enum
from functools import partial
from pathlib import Path
from typing import TYPE_CHECKING, Any, TextIO, cast
from uuid import UUID

from loguru import logger as ruLogger
from loguru._file_sink import FileSink

if TYPE_CHECKING:
    from loguru import Logger, Message, Record

from rapidkit_core import runtime_state
from rapidkit_core.config import settings
from rapidkit_core.diagnostics import exception_summary
from rapidkit_core.log_queue import FileLogSink
from rapidkit_core.nanoid import get_request_nanoid
from rapidkit_core.path import LOG_PATH

_owned_handlers: set[int] = {0}  # Loguru's initial default handler.
_file_sink: FileLogSink | None = None
_last_log_cleanup = float("-inf")
_component_failures: dict[str, tuple[int, float]] = {}
_FIELDS = frozenset(
    {
        "event",
        "service",
        "user_id",
        "actor_id",
        "impersonation_session_id",
        "edge_request_id",
        "method",
        "route",
        "http_status",
        "business_code",
        "outcome",
        "error_kind",
        "duration_ms",
        "header_duration_ms",
        "response_complete",
        "processing_failed",
        "task_id",
        "task_name",
        "attempt",
        "queue",
        "correlation_id",
        "component",
        "operation",
        "retryable",
        "namespace",
        "socket_connection_id",
        "socket_event_id",
        "event_name",
        "reason_code",
        "exception_type",
        "consecutive_failures",
        "diagnostic_truncated",
    }
)


class InterceptHandler(logging.Handler):
    """日志拦截处理器，将标准库日志重定向到 loguru。"""

    def emit(self, record: logging.LogRecord) -> None:
        if (
            record.name.startswith("uvicorn")
            and record.exc_info
            and getattr(record.exc_info[1], "_rapidkit_reported", False)
        ):
            return
        try:
            level = ruLogger.level(record.levelname).name
        except ValueError:
            level = record.levelno

        frame, depth = inspect.currentframe(), 0
        while frame and (depth == 0 or frame.f_code.co_filename == logging.__file__):
            frame = frame.f_back
            depth += 1

        if record.name.startswith(("celery.app.trace", "celery.worker.request")):
            data = record.args if isinstance(record.args, dict) else getattr(record, "data", {})
            ruLogger.bind(task_id=data.get("id"), task_name=data.get("name"), event="task.lifecycle").opt(
                depth=depth, exception=record.exc_info
            ).log(level, "Task lifecycle")
            return
        if record.name == "celery.worker.consumer.consumer" and isinstance(record.msg, str):
            # Match SDK templates before getMessage(): args contain raw broker payloads.
            for prefix, reason in (
                ("Received unregistered task of type %s.", "unknown_task"),
                ("Received and deleted unknown message.", "unknown_message"),
                ("Received invalid task message: %s", "invalid_task"),
                ("Can't decode message body: %r", "decode_error"),
            ):
                if record.msg.startswith(prefix):
                    ruLogger.bind(event="task.message.rejected", reason_code=reason).opt(
                        depth=depth, exception=record.exc_info
                    ).log(level, "Task message rejected")
                    return
        ruLogger.opt(depth=depth, exception=record.exc_info).log(level, record.getMessage())


def _payload(record: "Record") -> dict[str, Any]:
    exception = record["exception"]
    safe_exception = None
    if exception is not None:
        safe_exception = (
            exception_summary(exception.value)
            if settings.ENVIRONMENT.is_deployed
            else "".join(traceback.format_exception(exception.type, exception.value, exception.traceback))
        )
    payload = {
        "time": record["time"].isoformat(),
        "level": record["level"].name,
        "message": record["message"],
        "plugin": record["extra"].get("plugin", "Core"),
        "request_id": record.get("request_id", get_request_nanoid()),
        "logger": record["name"],
        "exception": safe_exception,
        "schema_version": 1,
        "environment": settings.ENVIRONMENT.value,
        "release": settings.SENTRY_RELEASE or settings.APP_VERSION,
        "hostname": socket.gethostname(),
        "pid": record["process"].id,
    }
    for key in _FIELDS:
        value = record["extra"].get(key)
        if isinstance(value, UUID):
            value = str(value)
        elif isinstance(value, Enum):
            value = value.value
        if value is None or isinstance(value, (str, int, float, bool)):
            if key in record["extra"]:
                payload[key] = value
    payload.setdefault("service", "api")
    return payload


def _prepare_record(record: "Record") -> None:
    cast(dict, record)["request_id"] = get_request_nanoid()
    record["extra"].setdefault("plugin", "Core")
    exception = record["exception"]
    if exception is not None and settings.ENVIRONMENT.is_deployed:
        value = str(exception.value)
        if value:
            record["message"] = record["message"].replace(value, "[Filtered]")
        record["extra"]["safe_exception"] = exception_summary(exception.value)
    record["extra"]["_json"] = json.dumps(_payload(record), ensure_ascii=False)


def default_formatter(record: "Record") -> str:
    """默认日志格式化程序"""
    record["extra"].setdefault("plugin", "Core")
    record_name = record["name"] or ""
    if record_name.startswith("sqlalchemy"):
        record["message"] = re.sub(r"\s+", " ", record["message"]).strip()

    format_str = settings.LOG_FORMAT.rstrip("\n") + "\n"

    if record["exception"] is not None:
        format_str += "{extra[safe_exception]}\n" if settings.ENVIRONMENT.is_deployed else "{exception}\n"
    return format_str


def request_id_filter(record: "Record") -> bool:
    """请求 ID 过滤器"""
    rid = get_request_nanoid()
    cast(dict, record)["request_id"] = rid
    return True


def json_sink(message: "Message", *, stream: TextIO | None = None) -> None:
    (stream if stream is not None else sys.stdout).write(
        json.dumps(_payload(message.record), ensure_ascii=False) + "\n"
    )


def setup_logging(service: str = "api") -> None:
    """设置日志处理器。"""
    global _file_sink
    ruLogger.configure(patcher=_prepare_record, extra={"service": service})
    runtime_state.start(service, settings.RUNTIME_STATE_DIR)
    logging.root.handlers = [InterceptHandler()]
    logging.root.setLevel(settings.LOG_LEVEL)

    for name in logging.root.manager.loggerDict.keys():
        logging.getLogger(name).handlers = []

        if "uvicorn.access" in name or "watchfiles.main" in name:
            logging.getLogger(name).propagate = False
        else:
            logging.getLogger(name).propagate = True

    for handler in _owned_handlers:
        try:
            ruLogger.remove(handler)
        except ValueError:
            pass
    _owned_handlers.clear()
    _file_sink = None
    handler = ruLogger.add(
        partial(json_sink, stream=sys.stdout) if settings.LOG_JSON else sys.stdout,
        level=settings.LOG_LEVEL,
        format=default_formatter,
        filter=request_id_filter,
        diagnose=not settings.ENVIRONMENT.is_deployed,
    )
    _owned_handlers.add(handler)


def rename_rotated_logfile(filepath: str, active_file: Path, *, suffix: str | None = None) -> None:
    """将轮转出的日志改名为 `<活动文件主干>.<日期>[-序号]<扩展名>`，保留实例标识。

    日期取文件最后写入时间的系统本地日期，即日志内容所属的那一天；loguru 也按系统本地时区判定零点边界，
    且要等零点后的下一条日志才触发轮转，因此不能用轮转时刻。
    """
    suffix = active_file.suffix if suffix is None else suffix
    stem = active_file.name.removesuffix(suffix)
    date = datetime.fromtimestamp(os.path.getmtime(filepath)).strftime("%Y-%m-%d")
    target = active_file.with_name(f"{stem}.{date}{suffix}")
    counter = 1
    while target.exists():
        counter += 1
        target = active_file.with_name(f"{stem}.{date}-{counter}{suffix}")
    os.rename(filepath, target)


def cleanup_logfiles(*, force: bool = False) -> None:
    """清理所有实例的过期归档和本机已退出进程的文件，每小时最多扫描一次。"""
    global _last_log_cleanup
    now = time.monotonic()
    if not force and now - _last_log_cleanup < 3600:
        return
    _last_log_cleanup = now
    cutoff = time.time() - settings.LOG_FILE_RETENTION_DAYS * 86400
    hostname = socket.gethostname()
    for filename in (settings.LOG_ACCESS_FILENAME, settings.LOG_ERROR_FILENAME):
        configured = LOG_PATH / filename
        stem, suffix = re.escape(configured.stem), re.escape(configured.suffix)
        instance_pattern = re.compile(rf"{stem}\.(?P<host>.+)\.(?P<pid>[1-9][0-9]*){suffix}")
        archive_pattern = re.compile(
            rf"{stem}\..+\.[1-9][0-9]*\.[0-9]{{4}}-[0-9]{{2}}-[0-9]{{2}}(?:-[1-9][0-9]*)?{suffix}"
        )
        legacy_pattern = re.compile(rf"{stem}_\d{{4}}-\d{{2}}-\d{{2}}{suffix}")
        try:
            for path in configured.parent.iterdir():
                match = instance_pattern.fullmatch(path.name)
                if (
                    match is None
                    and archive_pattern.fullmatch(path.name) is None
                    and legacy_pattern.fullmatch(path.name) is None
                ):
                    continue
                try:
                    metadata = path.stat(follow_symlinks=False)
                    if not stat.S_ISREG(metadata.st_mode) or metadata.st_mtime >= cutoff:
                        continue
                    if match is not None:
                        # 旧式日期.序号也可能是远程 hostname.pid，优先按活动文件处理。
                        # 无法确认远程进程是否存活；本机活跃或无法检查的 PID 也必须保留。
                        if match["host"] != hostname:
                            continue
                        try:
                            os.kill(int(match["pid"]), 0)
                        except ProcessLookupError:
                            pass
                        except OSError, OverflowError:
                            continue
                        else:
                            continue
                    path.unlink(missing_ok=True)
                except FileNotFoundError:
                    pass
                except OSError as exc:
                    # 此函数也在 Loguru sink 的锁内执行，不能再次调用 logger。
                    sys.stderr.write(f"Log cleanup failed for {path}: {exc}\n")
        except FileNotFoundError:
            pass
        except OSError as exc:
            sys.stderr.write(f"Log cleanup failed for {configured.parent}: {exc}\n")


class _FileRotation:
    def __init__(self) -> None:
        self._day: date | None = None
        self._max_bytes = settings.LOG_FILE_MAX_BYTES

    def __call__(self, message: "Message", file: TextIO) -> bool:
        cleanup_logfiles()
        day = message.record["time"].astimezone().date()
        if self._day is None:
            self._day = datetime.fromtimestamp(os.fstat(file.fileno()).st_mtime).date()
        file.seek(0, os.SEEK_END)
        size = file.tell()
        if size == 0:
            self._day = day
            return False
        if day > self._day or size + len(message.encode("utf-8")) > self._max_bytes:
            self._day = day
            return True
        return False


def set_custom_logfile(*, enqueue: bool = True) -> None:
    """设置自定义日志文件。

    在线进程使用有界线程队列；enqueue=False 仅用于离线命令或同步测试。
    """
    global _file_sink
    os.makedirs(LOG_PATH, exist_ok=True)
    cleanup_logfiles(force=True)

    instance_suffix = f".{socket.gethostname()}.{os.getpid()}"
    configured_access = LOG_PATH / settings.LOG_ACCESS_FILENAME
    configured_error = LOG_PATH / settings.LOG_ERROR_FILENAME
    log_access_file, log_error_file = (
        path.with_name(f"{path.stem}{instance_suffix}{path.suffix}") for path in (configured_access, configured_error)
    )

    log_config: dict[str, Any] = {
        "format": (lambda record: "{extra[_json]}\n") if settings.LOG_JSON else default_formatter,
        "enqueue": False,
    }

    targets = []
    channels = []
    for path, suffix, level, low in (
        (log_access_file, configured_access.suffix, settings.LOG_FILE_ACCESS_LEVEL, True),
        (log_error_file, configured_error.suffix, settings.LOG_FILE_ERROR_LEVEL, False),
    ):
        rotation = _FileRotation()
        compression = partial(rename_rotated_logfile, active_file=path, suffix=suffix)
        sink: Any
        if settings.LOG_FILE_BUDGET_BYTES is not None:
            # POSIX quota support must not prevent default logging on other platforms.
            from rapidkit_core.log_budget import BudgetedFile

            sink = BudgetedFile(
                path,
                root=LOG_PATH,
                limit=settings.LOG_FILE_BUDGET_BYTES,
                min_free=settings.LOG_FILE_MIN_FREE_BYTES,
                rotation=rotation,
                compression=compression,
            )
        else:
            sink = FileSink(str(path), encoding="utf-8", rotation=rotation, compression=compression, delay=True)
        targets.append(sink)
        channels.append((level, low))
    _file_sink = FileLogSink(tuple(targets), users=2) if enqueue else None
    for sink, (level, low) in zip(targets, channels, strict=True):
        handler = ruLogger.add(
            _file_sink if _file_sink is not None else sink,
            level=level,
            filter=(lambda record: record["level"].no <= 25) if low else (lambda record: record["level"].no >= 30),
            backtrace=not low,
            diagnose=not low and not settings.ENVIRONMENT.is_deployed,
            **log_config,
        )
        _owned_handlers.add(handler)


def complete_logging(timeout: float = 1.0) -> bool:
    """Wait at most timeout seconds for this process's bounded runtime file queue."""
    return _file_sink.complete(timeout) if _file_sink is not None else True


logger = ruLogger


def component_failed(component: str, error: BaseException) -> None:
    runtime_state.increment("component_failures:" + component)
    runtime_state.set_gauge("component_degraded:" + component, 1)
    count, last = _component_failures.get(component, (0, float("-inf")))
    now = time.monotonic()
    _component_failures[component] = (count + 1, now if now - last >= 60 else last)
    if now - last >= 60:
        logger.bind(event="component.degraded", component=component, consecutive_failures=count + 1).opt(
            exception=error
        ).warning("Background component degraded")


def component_recovered(component: str) -> None:
    runtime_state.set_gauge("component_degraded:" + component, 0)
    previous = _component_failures.pop(component, None)
    if previous is not None:
        logger.bind(event="component.recovered", component=component, consecutive_failures=previous[0]).info(
            "Background component recovered"
        )


def get_plugin_logger(plugin_name: str) -> "Logger":
    """Return a logger instance bound with the given plugin name."""
    return logger.bind(plugin=plugin_name)
