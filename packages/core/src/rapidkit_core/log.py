import inspect
import json
import logging
import os
import re
import socket
import sys
import traceback
from functools import partial
from pathlib import Path
from typing import TYPE_CHECKING, TextIO, cast

from loguru import logger as ruLogger

if TYPE_CHECKING:
    from loguru import Logger, Message, Record

from rapidkit_core.config import settings
from rapidkit_core.nanoid import get_request_nanoid
from rapidkit_core.path import LOG_PATH
from rapidkit_core.timezone import timezone

_owned_handlers: set[int] = {0}  # Loguru's initial default handler.


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
    )
    _owned_handlers.add(handler)


def set_custom_logfile() -> None:
    """设置自定义日志文件。"""
    os.makedirs(LOG_PATH, exist_ok=True)

    instance_suffix = f".{socket.gethostname()}.{os.getpid()}"
    access_name = settings.LOG_ACCESS_FILENAME.replace(".log", f"{instance_suffix}.log")
    error_name = settings.LOG_ERROR_FILENAME.replace(".log", f"{instance_suffix}.log")

    log_access_file = LOG_PATH.joinpath(access_name)
    log_error_file = LOG_PATH.joinpath(error_name)

    def compression(filepath: str) -> Path:
        filename = filepath.split(os.sep)[-1]
        original_filename = filename.split(".")[0]
        if "-" in original_filename:
            return LOG_PATH.joinpath(f"{original_filename}.log")
        return LOG_PATH.joinpath(f"{original_filename}_{timezone.now().strftime('%Y-%m-%d')}.log")

    log_config = {
        "format": default_formatter,
        "enqueue": True,
        "rotation": "00:00",
        "retention": "7 days",
        "compression": lambda filepath: os.rename(filepath, compression(filepath)),
    }

    access_handler = ruLogger.add(
        str(log_access_file),
        level=settings.LOG_FILE_ACCESS_LEVEL,
        filter=lambda record: record["level"].no <= 25,
        backtrace=False,
        diagnose=False,
        **log_config,
    )  # ty:ignore[no-matching-overload]

    error_handler = ruLogger.add(
        str(log_error_file),
        level=settings.LOG_FILE_ERROR_LEVEL,
        filter=lambda record: record["level"].no >= 30,
        backtrace=True,
        diagnose=True,
        **log_config,
    )  # ty:ignore[no-matching-overload]
    _owned_handlers.update((access_handler, error_handler))


logger = ruLogger


def get_plugin_logger(plugin_name: str) -> "Logger":
    """Return a logger instance bound with the given plugin name."""
    return logger.bind(plugin=plugin_name)
