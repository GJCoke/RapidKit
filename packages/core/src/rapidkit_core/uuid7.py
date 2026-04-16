"""
uuid6-python 包的 uuid6 模块副本。

仓库: https://github.com/oittaa/uuid6-python

作者  : Oittaa
"""

import secrets
import time
import uuid
from typing import Optional, Tuple

from pydantic import UUID1


class UUID(uuid.UUID):
    """UUID 类的实例表示符合 RFC 9562 的 UUID。"""

    __slots__ = ()

    def __init__(
        self,
        hex: Optional[str] = None,
        bytes: Optional[bytes] = None,
        bytes_le: Optional[bytes] = None,
        fields: Optional[Tuple[int, int, int, int, int, int]] = None,
        int: Optional[int] = None,
        version: Optional[int] = None,
        *,
        is_safe: uuid.SafeUUID = uuid.SafeUUID.unknown,
    ) -> None:
        if int is None or [hex, bytes, bytes_le, fields].count(None) != 4:
            super().__init__(
                hex=hex,
                bytes=bytes,
                bytes_le=bytes_le,
                fields=fields,
                int=int,
                version=version,
                is_safe=is_safe,
            )
            return
        if not 0 <= int < 1 << 128:
            raise ValueError("int is out of range (need a 128-bit value)")
        if version is not None:
            if not 6 <= version <= 8:
                raise ValueError("illegal version number")
            int &= ~(0xC000 << 48)
            int |= 0x8000 << 48
            int &= ~(0xF000 << 64)
            int |= version << 76
        super().__init__(int=int, is_safe=is_safe)

    @property
    def subsec(self) -> int:
        return ((self.int >> 64) & 0x0FFF) << 8 | ((self.int >> 54) & 0xFF)

    @property
    def time(self) -> int:
        if self.version == 6:
            return (self.time_low << 28) | (self.time_mid << 12) | (self.time_hi_version & 0x0FFF)
        if self.version == 7:
            return self.int >> 80
        if self.version == 8:
            return (self.int >> 80) * 10**6 + _subsec_decode(self.subsec)
        return super().time


class UUID6(UUID1):
    _required_version = 6


class UUID7(UUID1):
    _required_version = 7


class UUID8(UUID1):
    _required_version = 8


def _subsec_decode(value: int) -> int:
    return -(-value * 10**6 // 2**20)


def _subsec_encode(value: int) -> int:
    return value * 2**20 // 10**6


def uuid1_to_uuid6(uuid1: uuid.UUID) -> UUID:
    if uuid1.version != 1:
        raise ValueError("given UUID's version number must be 1")
    h = uuid1.hex
    h = h[13:16] + h[8:12] + h[0:5] + "6" + h[5:8] + h[16:]
    return UUID(hex=h, is_safe=uuid1.is_safe)


_last_v6_timestamp = None
_last_v7_timestamp = None
_last_v8_timestamp = None


def uuid6(node: Optional[int] = None, clock_seq: Optional[int] = None) -> UUID:
    global _last_v6_timestamp
    nanoseconds = time.time_ns()
    timestamp = nanoseconds // 100 + 0x01B21DD213814000
    if _last_v6_timestamp is not None and timestamp <= _last_v6_timestamp:
        timestamp = _last_v6_timestamp + 1
    _last_v6_timestamp = timestamp
    if clock_seq is None:
        clock_seq = secrets.randbits(14)
    if node is None:
        node = secrets.randbits(48)
    time_high_and_time_mid = (timestamp >> 12) & 0xFFFFFFFFFFFF
    time_low_and_version = timestamp & 0x0FFF
    uuid_int = time_high_and_time_mid << 80
    uuid_int |= time_low_and_version << 64
    uuid_int |= (clock_seq & 0x3FFF) << 48
    uuid_int |= node & 0xFFFFFFFFFFFF
    return UUID(int=uuid_int, version=6)


def uuid7() -> UUID:
    global _last_v7_timestamp
    nanoseconds = time.time_ns()
    timestamp_ms = nanoseconds // 10**6
    if _last_v7_timestamp is not None and timestamp_ms <= _last_v7_timestamp:
        timestamp_ms = _last_v7_timestamp + 1
    _last_v7_timestamp = timestamp_ms
    uuid_int = (timestamp_ms & 0xFFFFFFFFFFFF) << 80
    uuid_int |= secrets.randbits(76)
    return UUID(int=uuid_int, version=7)


def uuid8() -> UUID:
    global _last_v8_timestamp
    nanoseconds = time.time_ns()
    if _last_v8_timestamp is not None and nanoseconds <= _last_v8_timestamp:
        nanoseconds = _last_v8_timestamp + 1
    _last_v8_timestamp = nanoseconds
    timestamp_ms, timestamp_ns = divmod(nanoseconds, 10**6)
    subsec = _subsec_encode(timestamp_ns)
    subsec_a = subsec >> 8
    subsec_b = subsec & 0xFF
    uuid_int = (timestamp_ms & 0xFFFFFFFFFFFF) << 80
    uuid_int |= subsec_a << 64
    uuid_int |= subsec_b << 54
    uuid_int |= secrets.randbits(54)
    return UUID(int=uuid_int, version=8)
