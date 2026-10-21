"""Test utilities — random data generators."""

import random
import string
import uuid


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


def random_email(domain: str = "example.com") -> str:
    local = random_string(8, lower=True)
    return f"{local}@{domain}"


def random_uuid() -> uuid.UUID:
    return uuid.uuid4()
