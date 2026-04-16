"""Tests for I18nMiddleware language resolution."""

from src.locales.types import languages
from src.locales.utils import resolve_language


class TestResolveLanguage:
    def test_exact_match_zh_cn(self):
        result = resolve_language("zh-CN", languages)
        assert result == "zh-CN"

    def test_exact_match_en_us(self):
        result = resolve_language("en-US", languages)
        assert result == "en-US"

    def test_quality_preference(self):
        """Browser sends multiple languages with quality values."""
        result = resolve_language("zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7", languages)
        assert result == "zh-CN"

    def test_none_header_returns_none(self):
        result = resolve_language(None, languages)
        assert result is None

    def test_empty_header_returns_none(self):
        result = resolve_language("", languages)
        assert result is None

    def test_unsupported_language_returns_none(self):
        result = resolve_language("fr-FR", languages)
        assert result is None

    def test_base_language_fallback(self):
        """'zh' (without region) should fall back to 'zh-CN'."""
        result = resolve_language("zh", languages)
        assert result == "zh-CN"

    def test_base_language_fallback_en(self):
        """'en' (without region) should fall back to 'en-US'."""
        result = resolve_language("en", languages)
        assert result == "en-US"

    def test_quality_picks_highest_weight(self):
        """When en-US has higher quality than zh-CN, en-US wins."""
        result = resolve_language("zh-CN;q=0.5,en-US;q=0.9", languages)
        assert result == "en-US"

    def test_wildcard_not_matched(self):
        """'*' is not a supported language and should not match."""
        result = resolve_language("*", languages)
        assert result is None
