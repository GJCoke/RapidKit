from pathlib import Path

from starlette_context.errors import ContextDoesNotExistError

from src.core.config import settings
from src.core.context import ctx
from src.locales.types import I18nKey
from src.locales.utils import load_and_flatten_locales


class I18n:
    """
    Provides internationalization (i18n) support for the application, allowing
    developers to easily fetch and format localized strings based on the current
    language setting.

    Attributes:
        locales (dict[str, dict[str, str]]): A dictionary containing all loaded
            language translations, where each key is a language code and the value is
            another dictionary mapping translation keys to their corresponding
            localized strings.
    """

    def __init__(self) -> None:
        locale_path = Path(__file__).parent.joinpath("langs")
        self.locales: dict[str, dict[str, str]] = load_and_flatten_locales(locale_path)

    @property
    def current_language(self) -> str:
        """
        Gets the current language setting from the context.

        Returns:
            The current language code as a string.
        """
        try:
            return ctx.language
        except (AttributeError, LookupError, ContextDoesNotExistError):
            return settings.DEFAULT_LANGUAGE

    @current_language.setter
    def current_language(self, language: str) -> None:
        """
        Sets the current language in the context.

        Args:
            language: The language code to set as current.
        """
        ctx.language = language

    def t(self, key: I18nKey, **kwargs) -> str:
        """
        Fetches and formats a localized string based on the current language setting.

        Args:
            key: The localization key to look up.
            **kwargs: Additional keyword arguments for formatting the string.

        Returns:
            The formatted localized string or the default value if the key is not found.
        """
        data = self.locales.get(self.current_language, {})
        return data.get(key, key).format(**kwargs)


i18n = I18n()
t = i18n.t
