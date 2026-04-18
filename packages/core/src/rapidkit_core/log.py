import inspect
import logging
import os
import re
import sys
from pathlib import Path

from loguru import logger as ruLogger

from rapidkit_core.config import settings
from rapidkit_core.nanoid import get_request_nanoid
from rapidkit_core.path import LOG_PATH
from rapidkit_core.timezone import timezone


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


def default_formatter(record: dict) -> str:
    """默认日志格式化程序"""
    record_name = record["name"] or ""
    if record_name.startswith("sqlalchemy"):
        record["message"] = re.sub(r"\s+", " ", record["message"]).strip()

    format_str = settings.LOG_FORMAT.rstrip("\n") + "\n"

    if record["exception"] is not None:
        format_str += "{exception}\n"
    return format_str


def request_id_filter(record: dict) -> bool:
    """请求 ID 过滤器"""
    rid = get_request_nanoid()
    record["request_id"] = rid
    return True


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

    ruLogger.remove()
    ruLogger.configure(
        handlers=[  # type: ignore
            {
                "sink": sys.stdout,
                "level": settings.LOG_LEVEL,
                "format": default_formatter,
                "filter": lambda record: request_id_filter(record),
            }
        ]
    )


def set_custom_logfile() -> None:
    """设置自定义日志文件。"""
    os.makedirs(LOG_PATH, exist_ok=True)

    log_access_file = LOG_PATH.joinpath(settings.LOG_ACCESS_FILENAME)
    log_error_file = LOG_PATH.joinpath(settings.LOG_ERROR_FILENAME)

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

    ruLogger.add(
        str(log_access_file),
        level=settings.LOG_FILE_ACCESS_LEVEL,
        filter=lambda record: record["level"].no <= 25,
        backtrace=False,
        diagnose=False,
        **log_config,
    )  # ty:ignore[no-matching-overload]

    ruLogger.add(
        str(log_error_file),
        level=settings.LOG_FILE_ERROR_LEVEL,
        filter=lambda record: record["level"].no >= 30,
        backtrace=True,
        diagnose=True,
        **log_config,
    )  # ty:ignore[no-matching-overload]


logger = ruLogger
