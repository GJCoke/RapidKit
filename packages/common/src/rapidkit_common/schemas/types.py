"""
公共类型定义。

Author : Coke
Date   : 2026-04-13
"""

from datetime import datetime
from typing import Annotated

from pydantic import WithJsonSchema
from pydantic.functional_serializers import PlainSerializer
from rapidkit_core.timezone import timezone


def _to_local_str(v: datetime) -> str:
    """将 naive UTC datetime 转换为配置时区的格式化字符串。"""
    return timezone.f_datetime(v)


LocalDatetime = Annotated[datetime, PlainSerializer(_to_local_str, return_type=str)]
"""
自动将 datetime 序列化为配置时区字符串的 Pydantic 类型。

用于兼容的纯展示字段，不作为浏览器时间解析或时间计算的输入。
需要传递时刻时使用 UTCInstant 或 EditableInstant。
"""


def serialize_utc_instant(value: datetime) -> str:
    """传递可比较的时刻；naive 输入遵循数据库 UTC 约定。"""
    return timezone.to_utc(value).isoformat()


def serialize_editable_instant(value: datetime) -> str:
    """传递平台时区的时刻，同时保留浏览器可解析的 UTC 偏移。"""
    return timezone.to_local(value).isoformat()


UTCInstant = Annotated[
    datetime,
    PlainSerializer(serialize_utc_instant, return_type=str),
    WithJsonSchema(
        {"type": "string", "format": "date-time", "examples": ["2026-10-29T08:00:00+00:00"]}, mode="serialization"
    ),
]
EditableInstant = Annotated[
    datetime,
    PlainSerializer(serialize_editable_instant, return_type=str),
    WithJsonSchema(
        {"type": "string", "format": "date-time", "examples": ["2026-10-29T16:00:00+08:00"]}, mode="serialization"
    ),
]
