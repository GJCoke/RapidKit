"""
可插拔国际化翻译函数。

core 和 common 包通过此模块获取翻译能力，
宿主应用在启动时通过 set_translator() 注入真实的翻译函数。

Author : Coke
Date   : 2026-04-14
"""

from typing import Callable


def _default_translate(s: str) -> str:
    return s


def _default_is_i18n_key(s: str) -> bool:
    return "." in s


_translate: Callable[[str], str] = _default_translate
_is_i18n_key: Callable[[str], bool] = _default_is_i18n_key


def set_translator(
    translate_fn: Callable[[str], str],
    is_key_fn: Callable[[str], bool] | None = None,
) -> None:
    """
    注入真实的翻译函数。

    Args:
        translate_fn: 翻译函数，接受 key 返回翻译后的字符串。
        is_key_fn: 判断字符串是否为 i18n key 的函数。
    """
    global _translate, _is_i18n_key
    _translate = translate_fn
    if is_key_fn is not None:
        _is_i18n_key = is_key_fn


def t(key: str) -> str:
    """翻译给定的 key。"""
    return _translate(key)


def is_i18n_key(value: str) -> bool:
    """判断字符串是否为 i18n key。"""
    return _is_i18n_key(value)
