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
from functools import partial
from pathlib import Path
from typing import TYPE_CHECKING, Any, TextIO, cast

from loguru import logger as ruLogger

if TYPE_CHECKING:
    from loguru import Logger, Message, Record

from rapidkit_core.config import settings
from rapidkit_core.nanoid import get_request_nanoid
from rapidkit_core.path import LOG_PATH

_owned_handlers: set[int] = {0}  # Loguru's initial default handler.
_last_log_cleanup = float("-inf")


class InterceptHandler(logging.Handler):
    """日志拦截处理器，将标准库日志重定向到 loguru。"""

    def emit(self, record: logging.LogRecord) -> None:
        try:
            level = ruLogger.level(record.levelname).name
        except ValueError:
            level = record.levelno

        frame, depth = inspect.currentframe(), 0
        while frame and (depth == 0 or frame.f_code.co_filename == logging.__file__):
            frame = frame.f_back
            depth += 1

        ruLogger.opt(depth=depth, exception=record.exc_info).log(level, record.getMessage())


def default_formatter(record: "Record") -> str:
    """默认日志格式化程序"""
    record["extra"].setdefault("plugin", "Core")
    record_name = record["name"] or ""
    if record_name.startswith("sqlalchemy"):
        record["message"] = re.sub(r"\s+", " ", record["message"]).strip()

    format_str = settings.LOG_FORMAT.rstrip("\n") + "\n"

    if record["exception"] is not None:
        format_str += "{exception}\n"
    return format_str


def request_id_filter(record: "Record") -> bool:
    """请求 ID 过滤器"""
    rid = get_request_nanoid()
    cast(dict, record)["request_id"] = rid
    return True


def json_sink(message: "Message", *, stream: TextIO | None = None) -> None:
    record = message.record
    exception = record["exception"]
    payload = {
        "time": record["time"].isoformat(),
        "level": record["level"].name,
        "message": record["message"],
        "plugin": record["extra"].get("plugin", "Core"),
        "request_id": record.get("request_id", get_request_nanoid()),
        "logger": record["name"],
        "exception": "".join(traceback.format_exception(exception.type, exception.value, exception.traceback))
        if exception is not None
        else None,
    }
    (stream if stream is not None else sys.stdout).write(json.dumps(payload, ensure_ascii=False) + "\n")


def setup_logging() -> None:
    """设置日志处理器。"""
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

    每个进程写入带 `hostname.pid` 后缀的独立文件；不需要异步写入的进程（如 Celery prefork 子进程）
    可传 `enqueue=False`，避免 enqueue 创建的信号量在子进程 `os._exit` 时被报告为泄漏。
    """
    os.makedirs(LOG_PATH, exist_ok=True)
    cleanup_logfiles(force=True)

    instance_suffix = f".{socket.gethostname()}.{os.getpid()}"
    configured_access = LOG_PATH / settings.LOG_ACCESS_FILENAME
    configured_error = LOG_PATH / settings.LOG_ERROR_FILENAME
    log_access_file, log_error_file = (
        path.with_name(f"{path.stem}{instance_suffix}{path.suffix}") for path in (configured_access, configured_error)
    )

    log_config: dict[str, Any] = {
        "format": default_formatter,
        "enqueue": enqueue,
        "encoding": "utf-8",
    }

    access_handler = ruLogger.add(
        str(log_access_file),
        level=settings.LOG_FILE_ACCESS_LEVEL,
        filter=lambda record: record["level"].no <= 25,
        backtrace=False,
        diagnose=False,
        rotation=_FileRotation(),
        compression=partial(rename_rotated_logfile, active_file=log_access_file, suffix=configured_access.suffix),
        **log_config,
    )

    error_handler = ruLogger.add(
        str(log_error_file),
        level=settings.LOG_FILE_ERROR_LEVEL,
        filter=lambda record: record["level"].no >= 30,
        backtrace=True,
        diagnose=not settings.ENVIRONMENT.is_deployed,
        rotation=_FileRotation(),
        compression=partial(rename_rotated_logfile, active_file=log_error_file, suffix=configured_error.suffix),
        **log_config,
    )
    _owned_handlers.update((access_handler, error_handler))


logger = ruLogger


def get_plugin_logger(plugin_name: str) -> "Logger":
    """Return a logger instance bound with the given plugin name."""
    return logger.bind(plugin=plugin_name)
