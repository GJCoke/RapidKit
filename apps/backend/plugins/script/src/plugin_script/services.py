"""
Script domain services.

Author  : Coke
Date    : 2026-03-31
"""

import asyncio
import time
from typing import Any

from rapidkit_common.enums import Status
from rapidkit_core.config import settings
from rapidkit_core.exceptions import AppException
from rapidkit_core.log import logger
from rapidkit_core.status_codes import StatusCode
from sqlalchemy import ColumnElement
from sqlmodel import col, or_

from plugin_script.models import Script

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
    """构建脚本查询过滤条件。"""
    filters: list[ColumnElement[bool]] = []

    if status is not None:
        filters.append(col(Script.status) == status)

    if language is not None:
        filters.append(col(Script.language) == language)

    if keyword:
        escaped = keyword.replace("%", r"\%").replace("_", r"\_")
        filters.append(
            or_(
                col(Script.name).like(f"%{escaped}%"),
                col(Script.description).like(f"%{escaped}%"),
            )
        )

    return filters


async def execute_code(language: str, code: str) -> dict[str, Any]:
    """在子进程中执行代码并捕获输出。"""

    cmd = _LANGUAGE_COMMANDS.get(language)
    if not cmd:
        raise AppException(StatusCode.BAD_REQUEST)

    timeout = settings.SCRIPT_EXEC_TIMEOUT
    max_output = settings.SCRIPT_EXEC_MAX_OUTPUT

    start = time.monotonic()

    process = None

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
        if process:
            process.kill()
            await process.wait()

        elapsed = time.monotonic() - start
        logger.warning(
            "[Script] Code execution timed out: language={language} timeout={timeout}s",
            language=language,
            timeout=timeout,
        )
        return {
            "stdout": None,
            "stderr": f"Execution timed out after {timeout}s",
            "exit_code": -1,
            "runtime": round(elapsed, 3),
        }

    logger.info(
        "[Script] Code executed: language={language} exit_code={exit_code} runtime={runtime}s",
        language=language,
        exit_code=exit_code,
        runtime=round(elapsed, 3),
    )

    stdout = stdout_bytes.decode("utf-8", errors="replace")[:max_output] if stdout_bytes else None
    stderr = stderr_bytes.decode("utf-8", errors="replace")[:max_output] if stderr_bytes else None

    return {
        "stdout": stdout or None,
        "stderr": stderr or None,
        "exit_code": exit_code,
        "runtime": round(elapsed, 3),
    }
