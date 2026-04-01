"""
Script domain services.

Author  : Claude
Date    : 2026-03-31
"""

import asyncio
import time
from typing import Any

from sqlalchemy import ColumnElement
from sqlmodel import col, or_

from src.core.config import settings
from src.core.exceptions import AppException
from src.core.status_codes import StatusCode
from src.domains.script.models import Script
from src.utils.enums import Status

_LANGUAGE_COMMANDS: dict[str, list[str]] = {
    "python": ["python3", "-c"],
    "javascript": ["node", "-e"],
    "shell": ["bash", "-c"],
}


def filter_script(
    status: Status | None,
    language: str | None,
    keyword: str,
) -> list[ColumnElement[bool]]:
    """
    构建脚本查询过滤条件。

    Args:
        status: 状态筛选。
        language: 语言筛选。
        keyword: 关键字搜索（名称或描述）。

    Returns:
        SQLAlchemy 过滤条件列表。
    """
    filters: list[ColumnElement[bool]] = []

    if status is not None:
        filters.append(col(Script.status) == status)

    if language is not None:
        filters.append(col(Script.language) == language)

    if keyword:
        filters.append(
            or_(
                col(Script.name).like(f"%{keyword}%"),
                col(Script.description).like(f"%{keyword}%"),
            )
        )

    return filters


async def execute_code(language: str, code: str) -> dict[str, Any]:
    """
    在子进程中执行代码并捕获输出。

    Args:
        language: 语言标识（python / javascript / shell）。
        code: 要执行的代码。

    Returns:
        包含 stdout, stderr, exit_code, runtime 的字典。

    Raises:
        AppException: 不支持的语言。
    """
    cmd = _LANGUAGE_COMMANDS.get(language)
    if not cmd:
        raise AppException(StatusCode.BAD_REQUEST)

    timeout = settings.SCRIPT_EXEC_TIMEOUT
    max_output = settings.SCRIPT_EXEC_MAX_OUTPUT

    start = time.monotonic()

    try:
        process = await asyncio.create_subprocess_exec(
            *cmd,
            code,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )

        stdout_bytes, stderr_bytes = await asyncio.wait_for(
            process.communicate(),
            timeout=timeout,
        )

        elapsed = time.monotonic() - start
        exit_code = process.returncode or 0

    except asyncio.TimeoutError:
        process.kill()
        await process.wait()
        elapsed = time.monotonic() - start
        return {
            "stdout": None,
            "stderr": f"Execution timed out after {timeout}s",
            "exit_code": -1,
            "runtime": round(elapsed, 3),
        }

    stdout = stdout_bytes.decode("utf-8", errors="replace")[:max_output] if stdout_bytes else None
    stderr = stderr_bytes.decode("utf-8", errors="replace")[:max_output] if stderr_bytes else None

    return {
        "stdout": stdout or None,
        "stderr": stderr or None,
        "exit_code": exit_code,
        "runtime": round(elapsed, 3),
    }
