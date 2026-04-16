"""
Test utilities — random data generators.

Migrated from tests/utils.py.
"""

import random
import string
import uuid
from datetime import datetime, timedelta


def random_string(
    length: int = 10,
    *,
    upper: bool = False,
    lower: bool = False,
    digits: bool = True,
    punctuation: bool = False,
) -> str:
    chars = ""
    if upper:
        chars += string.ascii_uppercase
    if lower:
        chars += string.ascii_lowercase
    if digits:
        chars += string.digits
    if punctuation:
        chars += string.punctuation
    if not chars:
        raise ValueError("At least one character type must be selected.")
    return "".join(random.choices(chars, k=length))


def random_uppercase(length: int = 8) -> str:
    return "".join(random.choices(string.ascii_uppercase, k=length))


def random_lowercase(length: int = 8) -> str:
    return "".join(random.choices(string.ascii_lowercase, k=length))


def random_digits(length: int = 6) -> str:
    return "".join(random.choices(string.digits, k=length))


def random_punctuation(length: int = 5) -> str:
    return "".join(random.choices(string.punctuation, k=length))


def random_email(domain: str = "example.com") -> str:
    local = random_string(8, lower=True)
    return f"{local}@{domain}"


def random_username(prefix: str = "user") -> str:
    suffix = random_string(6)
    return f"{prefix}_{suffix}"


def random_password(length: int = 12) -> str:
    return random_string(length, upper=True, lower=True, digits=True, punctuation=True)


def random_uuid() -> uuid.UUID:
    return uuid.uuid4()


def random_text(min_words: int = 5, max_words: int = 15) -> str:
    words = ["alpha", "beta", "gamma", "delta", "omega", "test", "random", "value", "check", "input"]
    num_words = random.randint(min_words, max_words)
    return " ".join(random.choices(words, k=num_words)).capitalize() + "."


def random_datetime(start_days_ago: int = 30, end_days_ago: int = 0) -> datetime:
    start = datetime.now() - timedelta(days=start_days_ago)
    end = datetime.now() - timedelta(days=end_days_ago)
    return start + (end - start) * random.random()
