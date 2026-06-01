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

    通过全局单例 ``timezone`` 统一项目内所有时区操作。
    """

    def __init__(self, tz: str = "UTC", fmt: str = "%Y-%m-%d %H:%M:%S") -> None:
        self.tz_info = zoneinfo.ZoneInfo(tz)
        self.fmt = fmt

    def now(self) -> datetime:
        """获取当前 naive UTC 时间。"""
        return datetime.now(UTC).replace(tzinfo=None)

    def now_local(self) -> datetime:
        """获取当前配置时区的 aware datetime。"""
        return datetime.now(self.tz_info)

    def to_local(self, dt: datetime) -> datetime:
        """将 datetime 转换为配置时区。"""
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=datetime_timezone.utc)
        return dt.astimezone(self.tz_info)

    @staticmethod
    def to_utc(dt: datetime | int) -> datetime:
        """将 datetime 或时间戳转换为 UTC。"""
        if isinstance(dt, datetime):
            return dt.astimezone(datetime_timezone.utc)
        return datetime.fromtimestamp(dt, tz=datetime_timezone.utc)

    def f_datetime(self, dt: datetime) -> str:
        """将 datetime 转为配置时区后，按配置格式输出字符串。"""
        return self.to_local(dt).strftime(self.fmt)

    def f_time(self, dt: datetime) -> str:
        """将 datetime 转为配置时区后，仅输出 HH:MM:SS。"""
        return self.to_local(dt).strftime("%H:%M:%S")

    def from_str(self, t_str: str) -> datetime:
        """将时间字符串按配置格式解析为配置时区的 datetime。"""
        return datetime.strptime(t_str, self.fmt).replace(tzinfo=self.tz_info)


def _create_timezone() -> TimeZone:
    from rapidkit_core.config import get_settings

    s = get_settings()
    return TimeZone(tz=s.DATETIME_TIMEZONE, fmt=s.DATETIME_FORMAT)


from rapidkit_core.proxy import LazyProxy  # noqa: E402

timezone: TimeZone = LazyProxy(_create_timezone)  # type: ignore
