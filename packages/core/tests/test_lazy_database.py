from rapidkit_core.proxy import LazyProxy
from rapidkit_core.database import (
    async_engine,
    get_async_engine,
    get_sync_engine,
    override_async_engine,
    reset_engines,
    sync_engine,
)


class TestLazyDatabase:
    def test_proxy_async_engine_is_lazy(self):
        """Module-level async_engine is a LazyProxy."""
        assert isinstance(async_engine, LazyProxy)

    def test_proxy_sync_engine_is_lazy(self):
        """Module-level sync_engine is a LazyProxy."""
        assert isinstance(sync_engine, LazyProxy)

    def test_get_async_engine_returns_engine(self):
        """get_async_engine() returns an AsyncEngine."""
        engine = get_async_engine()
        assert engine is not None
        assert hasattr(engine, "begin")

    def test_get_async_engine_is_cached(self):
        """Multiple calls return same engine."""
        assert get_async_engine() is get_async_engine()

    def test_get_sync_engine_returns_engine(self):
        """get_sync_engine() returns an Engine."""
        engine = get_sync_engine()
        assert engine is not None

    def test_override_async_engine(self):
        """override_async_engine() injects a custom engine."""
        sentinel = object()
        override_async_engine(sentinel)
        try:
            assert get_async_engine() is sentinel
        finally:
            reset_engines()

    def test_reset_engines_clears_cache(self):
        """After reset, engines are recreated on next access."""
        _ = get_async_engine()
        reset_engines()
        # Should not crash — recreates engine
        e = get_async_engine()
        assert e is not None
