from pathlib import Path

from src.core.context import current_language
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

    def t(self, key: I18nKey, **kwargs) -> str:
        """
        Fetches and formats a localized string based on the current language setting.

        Args:
            key: The localization key to look up.
            **kwargs: Additional keyword arguments for formatting the string.

        Returns:
            The formatted localized string or the default value if the key is not found.
        """
        lang = current_language.get()
        data = self.locales.get(lang, {})
        return data.get(key, key).format(**kwargs)


i18n = I18n()
t = i18n.t
