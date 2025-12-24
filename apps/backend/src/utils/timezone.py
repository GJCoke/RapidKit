import zoneinfo
from datetime import UTC, datetime
from datetime import timezone as datetime_timezone


class TimeZone:
    """
    时区转换器类。
    """

    format_str: str

    def __init__(self, timezone: str, format_str: str = "%Y-%m-%d %H:%M:%S") -> None:
        """
        初始化时区转换器。
        """
        self.tz_info = zoneinfo.ZoneInfo(timezone)
        self.format_str = format_str

    def now(self) -> datetime:
        """
        获取当前时区时间。

        Returns:
            当前时区的 datetime 对象。
        """
        return datetime.now(self.tz_info)

    def utc_now(self) -> datetime:
        """
        获取当前 UTC 时间。

        Returns:
            当前 UTC 的 datetime 对象。
        """
        return datetime.now(UTC)

    def from_datetime(self, t: datetime) -> datetime:
        """
        将 datetime 对象转换为当前时区时间。

        Args:
            t: 需要转换的 datetime 对象。

        Returns:
            转换后的当前时区 datetime 对象。
        """
        return t.astimezone(self.tz_info)

    def from_str(self, t_str: str) -> datetime:
        """
        将时间字符串转换为当前时区的 datetime 对象。

        Args:
            t_str: 时间字符串。

        Returns:
            转换后的当前时区 datetime 对象。
        """
        return datetime.strptime(t_str, self.format_str).replace(tzinfo=self.tz_info)

    def to_str(self, t: datetime) -> str:
        """
        将 datetime 对象转换为指定格式的时间字符串。

        Args:
            t: datetime 对象。

        Returns:
            格式化后的时间字符串。
        """
        return t.strftime(self.format_str)

    @staticmethod
    def to_utc(t: datetime | int) -> datetime:
        """
        将 datetime 对象或时间戳转换为 UTC 时区时间。

        Args:
            t: 需要转换的 datetime 对象或时间戳。

        Returns:
            UTC 时区的 datetime 对象。
        """
        if isinstance(t, datetime):
            return t.astimezone(datetime_timezone.utc)
        return datetime.fromtimestamp(t, tz=datetime_timezone.utc)
