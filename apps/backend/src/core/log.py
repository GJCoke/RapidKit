import inspect
import logging
import os
import re
import sys
from pathlib import Path

from loguru import logger as ruLogger

from src.core.config import settings
from src.core.path import LOG_PATH
from src.utils.nanoid import get_request_nanoid
from src.utils.timezone import timezone


class InterceptHandler(logging.Handler):
    """
    日志拦截处理器，用于将标准库的日志重定向到 loguru

    参考：https://loguru.readthedocs.io/en/stable/overview.html#entirely-compatible-with-standard-logging
    """

    def emit(self, record: logging.LogRecord) -> None:
        # 获取对应的 Loguru 级别（如果存在）
        try:
            level = ruLogger.level(record.levelname).name
        except ValueError:
            level = record.levelno

        # 查找记录日志消息的调用者
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

    return settings.LOG_FORMAT.rstrip("\n") + "\n"


def request_id_filter(record: dict) -> dict:
    """请求 ID 过滤器"""
    rid = get_request_nanoid()
    record["request_id"] = rid[: settings.NANOID_LOG_LENGTH]
    return record


def setup_logging() -> None:
    """
    设置日志处理器

    参考：
    - https://github.com/benoitc/gunicorn/issues/1572#issuecomment-638391953
    - https://github.com/pawamoy/pawamoy.github.io/issues/17
    """
    # 设置根日志处理器和级别
    logging.root.handlers = [InterceptHandler()]
    logging.root.setLevel(settings.LOG_LEVEL)

    for name in logging.root.manager.loggerDict.keys():
        # 清空所有默认日志处理器
        logging.getLogger(name).handlers = []

        # 配置日志传播规则
        if "uvicorn.access" in name or "watchfiles.main" in name:
            logging.getLogger(name).propagate = False
        else:
            logging.getLogger(name).propagate = True

        # Debug log handlers
        # logging.debug(f'{logging.getLogger(name)}, {logging.getLogger(name).propagate}')

    # 移除 loguru 默认处理器
    ruLogger.remove()

    # 配置 loguru 处理器
    ruLogger.configure(
        handlers=[
            {
                "sink": sys.stdout,
                "level": settings.LOG_LEVEL,
                "format": default_formatter,
                "filter": lambda record: request_id_filter(record),
            }
        ]  # ty:ignore[invalid-argument-type]
    )


def set_custom_logfile() -> None:
    """设置自定义日志文件"""
    if not os.path.exists(LOG_PATH):
        os.mkdir(LOG_PATH)

    # 日志文件
    log_access_file = LOG_PATH.joinpath(settings.LOG_ACCESS_FILENAME)
    log_error_file = LOG_PATH.joinpath(settings.LOG_ERROR_FILENAME)

    # 日志压缩回调
    def compression(filepath: str) -> Path:
        filename = filepath.split(os.sep)[-1]
        original_filename = filename.split(".")[0]
        if "-" in original_filename:
            return LOG_PATH.joinpath(f"{original_filename}.log")
        return LOG_PATH.joinpath(f"{original_filename}_{timezone.now().strftime('%Y-%m-%d')}.log")

    # 日志文件通用配置
    # https://loguru.readthedocs.io/en/stable/api/logger.html#loguru._logger.Logger.add
    log_config = {
        "format": default_formatter,
        "enqueue": True,
        "rotation": "00:00",
        "retention": "7 days",
        "compression": lambda filepath: os.rename(filepath, compression(filepath)),
    }

    # 标准输出文件
    ruLogger.add(
        str(log_access_file),
        level=settings.LOG_FILE_ACCESS_LEVEL,
        filter=lambda record: record["level"].no <= 25,
        backtrace=False,
        diagnose=False,
        **log_config,
    )  # ty:ignore[no-matching-overload]

    # 标准错误文件
    ruLogger.add(
        str(log_error_file),
        level=settings.LOG_FILE_ERROR_LEVEL,
        filter=lambda record: record["level"].no >= 30,
        backtrace=True,
        diagnose=True,
        **log_config,
    )  # ty:ignore[no-matching-overload]


# 创建 logger 实例
logger = ruLogger
