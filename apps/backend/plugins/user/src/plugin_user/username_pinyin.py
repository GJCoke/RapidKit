"""Canonical username suggestions derived from personal names."""

from dataclasses import dataclass

from pypinyin import lazy_pinyin

_REMOVED_SEPARATORS = frozenset({" ", "\t", "\r", "\n", "·", "・", "-"})


@dataclass(frozen=True, slots=True)
class UsernamePinyinCheck:
    """The canonical suggestion and exact-match result for one username."""

    suggested_username: str
    consistent: bool


def suggest_username(name: str) -> str:
    """Convert a personal name into its lowercase, separator-free pinyin."""
    normalized_name = "".join(character for character in name.strip() if character not in _REMOVED_SEPARATORS)
    return "".join(lazy_pinyin(normalized_name, errors=lambda value: value)).lower()


def check_username_pinyin(name: str, username: str) -> UsernamePinyinCheck:
    """Compare a username with the canonical suggestion using exact equality."""
    suggested_username = suggest_username(name)
    return UsernamePinyinCheck(
        suggested_username=suggested_username,
        consistent=username == suggested_username,
    )
