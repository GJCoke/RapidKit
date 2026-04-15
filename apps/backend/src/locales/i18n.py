from pathlib import Path

from rapidkit_core.config import settings
from rapidkit_core.context import ctx
from starlette_context.errors import ContextDoesNotExistError

from src.locales.types import I18nKey
from src.locales.utils import load_and_flatten_locales


class I18n:
    """
    为应用程序提供国际化 (i18n) 支持，允许开发人员根据当前语言设置
    轻松获取和格式化本地化字符串。

    Attributes:
        locales: 包含所有已加载语言翻译的字典，其中每个键是语言代码，
            值是另一个字典，映射翻译键到其对应的本地化字符串。
    """

    def __init__(self) -> None:
        locale_path = Path(__file__).parent.joinpath("langs")
        self.locales: dict[str, dict[str, str]] = load_and_flatten_locales(locale_path)

    @property
    def current_language(self) -> str:
        """
        获取上下文中的当前语言设置。

        Returns:
            当前语言代码。
        """
        try:
            return ctx.language
        except AttributeError, LookupError, ContextDoesNotExistError:
            return settings.DEFAULT_LANGUAGE

    @current_language.setter
    def current_language(self, language: str) -> None:
        """
        设置上下文中的当前语言。

        Args:
            language: 要设置为当前的语言代码。
        """
        ctx.language = language

    def t(self, key: I18nKey, language: str | None = None, **kwargs) -> str:
        """
        基于当前语言设置获取和格式化本地化字符串。

        Args:
            key: 要查找的本地化键。
            **kwargs: 用于格式化字符串的附加关键字参数。

        Returns:
            格式化的本地化字符串，如果未找到键则返回默认值。
        """
        data = self.locales.get(language or self.current_language, {})
        return data.get(key, key).format(**kwargs)

    def is_i18n_key(value: str) -> bool:
        """
        判断给定的值是否为 i18n 翻译键。

        i18n 键的格式特征是包含 "."（如 "common.response.success"），
        用于区分实际的翻译键和直接的错误消息字符串。

        Args:
            value: 要判断的字符串值。

        Returns:
            如果是 i18n 键则返回 True，否则返回 False。
        """
        return "." in value


i18n = I18n()
t = i18n.t
is_i18n_key = I18n.is_i18n_key
