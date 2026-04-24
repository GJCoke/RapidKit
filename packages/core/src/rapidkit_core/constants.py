"""
constants file.

Author : Coke
Date   : 2025-03-10
"""

from typing import Literal, TypeAlias

# Time duration constants (in seconds)
SECONDS = 1
MINUTES = SECONDS * 60
HOURS = MINUTES * 60
DAYS = HOURS * 24
WEEKS = DAYS * 7

# Storage size constants (in bytes)
KB = 1024
MB = KB * KB
GB = MB * KB
TB = GB * KB

LOG_LEVELS: TypeAlias = Literal["TRACE", "DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]

LANGUAGE_TYPE: TypeAlias = Literal["zh-CN", "en-US"]
