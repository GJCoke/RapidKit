"""
时区工具。

提供全局 TimeZone 单例，统一管理时区转换与格式化。

Author : Coke
Date   : 2025-04-12
"""

import zoneinfo
from datetime import UTC, datetime
from datetime import timezone as datetime_timezone


class TimeZone:
    """
    时区转换器。

    通过全局单例 ``timezone`` 统一项目内所有时区操作，
    避免各模块分散使用 ``datetime.now()`` / ``ZoneInfo`` 导致不一致。
    """

    def __init__(self, tz: str = "UTC", fmt: str = "%Y-%m-%d %H:%M:%S") -> None:
        self.tz_info = zoneinfo.ZoneInfo(tz)
        self.fmt = fmt

    # ------------------------------------------------------------------
    # 获取当前时间
    # ------------------------------------------------------------------

    def now(self) -> datetime:
        """
        获取当前 naive UTC 时间（兼容 TIMESTAMP WITHOUT TIME ZONE 列）。

        Returns:
            不含 tzinfo 的 UTC datetime，可直接写入 Postgres。
        """
        return datetime.now(UTC).replace(tzinfo=None)

    def now_local(self) -> datetime:
        """
        获取当前配置时区的 aware datetime。

        Returns:
            带 tzinfo 的本地时间。
        """
        return datetime.now(self.tz_info)

    # ------------------------------------------------------------------
    # 转换
    # ------------------------------------------------------------------

    def to_local(self, dt: datetime) -> datetime:
        """
        将 datetime 转换为配置时区。

        如果传入 naive datetime，默认视为 UTC。

        Args:
            dt: 需要转换的 datetime 对象。

        Returns:
            转换后的带时区 datetime。
        """
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=datetime_timezone.utc)
        return dt.astimezone(self.tz_info)

    @staticmethod
    def to_utc(dt: datetime | int) -> datetime:
        """
        将 datetime 或时间戳转换为 UTC。

        Args:
            dt: datetime 对象或 Unix 时间戳。

        Returns:
            UTC 时区的 datetime 对象。
        """
        if isinstance(dt, datetime):
            return dt.astimezone(datetime_timezone.utc)
        return datetime.fromtimestamp(dt, tz=datetime_timezone.utc)

    # ------------------------------------------------------------------
    # 格式化
    # ------------------------------------------------------------------

    def f_datetime(self, dt: datetime) -> str:
        """
        将 datetime 转为配置时区后，按配置格式输出字符串。

        Args:
            dt: 需要格式化的 datetime（naive 视为 UTC）。

        Returns:
            格式化后的时间字符串。
        """
        return self.to_local(dt).strftime(self.fmt)

    def f_time(self, dt: datetime) -> str:
        """
        将 datetime 转为配置时区后，仅输出 HH:MM:SS。

        Args:
            dt: 需要格式化的 datetime。

        Returns:
            HH:MM:SS 格式字符串。
        """
        return self.to_local(dt).strftime("%H:%M:%S")

    def from_str(self, t_str: str) -> datetime:
        """
        将时间字符串按配置格式解析为配置时区的 datetime。

        Args:
            t_str: 时间字符串。

        Returns:
            带配置时区信息的 datetime 对象。
        """
        return datetime.strptime(t_str, self.fmt).replace(tzinfo=self.tz_info)


# ------------------------------------------------------------------
# 全局单例 —— 在 settings 初始化后创建
# ------------------------------------------------------------------


def _create_timezone() -> TimeZone:
    from src.core.config import settings

    return TimeZone(tz=settings.DATETIME_TIMEZONE, fmt=settings.DATETIME_FORMAT)


# 延迟初始化，模块首次被 import 时创建
timezone = _create_timezone()
