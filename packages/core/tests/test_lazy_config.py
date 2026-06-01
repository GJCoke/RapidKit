from rapidkit_core.proxy import LazyProxy
from rapidkit_core.config import Config, get_settings, override_settings, reset_settings, settings


class TestLazySettings:
    def test_settings_is_lazy_proxy(self):
        """Module-level settings is a LazyProxy."""
        assert isinstance(settings, LazyProxy)

    def test_get_settings_returns_config(self):
        """get_settings() returns a Config instance."""
        s = get_settings()
        assert isinstance(s, Config)

    def test_get_settings_is_cached(self):
        """Multiple calls return the same instance."""
        assert get_settings() is get_settings()

    def test_override_settings_replaces_instance(self):
        """override_settings() injects a custom instance."""

        class FakeConfig:
            APP_NAME = "TestApp"

        override_settings(FakeConfig())
        try:
            assert get_settings().APP_NAME == "TestApp"
            assert settings.APP_NAME == "TestApp"
        finally:
            reset_settings()

    def test_reset_settings_clears_cache(self):
        """After reset, next get_settings() creates fresh Config."""
        override_settings(type("Fake", (), {"X": 1})())
        reset_settings()
        s = get_settings()
        assert isinstance(s, Config)
        assert hasattr(s, "APP_NAME")

    def test_settings_proxy_is_transparent(self):
        """Module-level settings proxy forwards attribute access."""
        assert isinstance(settings.APP_NAME, str)
        assert settings.APP_NAME == "RapidKit"
