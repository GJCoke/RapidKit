"""
Author  : Coke
Date    : 2025-04-24
"""

from datetime import UTC, datetime
from zoneinfo import ZoneInfo


def convert_datetime_to_gmt(dt: datetime) -> str:
    """
    将 datetime 对象转换为 GMT 时区字符串。

    Args:
        dt: 要转换的 datetime 对象（可为 naive 或 aware）。

    Returns:
        GMT 时区格式的字符串 '%Y-%m-%d %H:%M:%S'
    """
    if not dt.tzinfo:
        dt = dt.replace(tzinfo=ZoneInfo("UTC"))
    return dt.strftime("%Y-%m-%d %H:%M:%S")


def get_current_utc_time() -> datetime:
    """
    获取当前 UTC 时间。
    """
    return datetime.now(UTC)
