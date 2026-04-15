"""
公共类型定义。

Author : Coke
Date   : 2026-04-13
"""

from datetime import datetime
from typing import Annotated

from pydantic.functional_serializers import PlainSerializer


def _to_local_str(v: datetime) -> str:
    """将 naive UTC datetime 转换为配置时区的格式化字符串。"""
    from rapidkit_core.timezone import timezone

    return timezone.f_datetime(v)


LocalDatetime = Annotated[datetime, PlainSerializer(_to_local_str, return_type=str)]
"""
自动将 datetime 序列化为配置时区字符串的 Pydantic 类型。

用于 Schema 中所有需要展示给前端的 datetime 字段，
序列化时自动调用 ``timezone.f_datetime()`` 完成 UTC → 本地时区 → 字符串 的转换。
"""
