from rapidkit_core.proxy import LazyProxy


class TestLazyProxy:
    def test_defers_creation(self):
        """Factory is NOT called until first attribute access."""
        call_count = 0

        class Obj:
            x = 42

        def factory():
            nonlocal call_count
            call_count += 1
            return Obj()

        proxy = LazyProxy(factory)
        assert call_count == 0
        _ = proxy.x
        assert call_count == 1

    def test_caches_instance(self):
        """Second access reuses the same instance."""
        class Obj:
            x = 1

        proxy = LazyProxy(Obj)
        obj1 = proxy.get_instance()
        obj2 = proxy.get_instance()
        assert obj1 is obj2

    def test_getattr_forwarding(self):
        """All attributes forward to the wrapped object."""
        class Cfg:
            HOST = "localhost"
            PORT = 5432

        proxy = LazyProxy(Cfg)
        assert proxy.HOST == "localhost"
        assert proxy.PORT == 5432

    def test_reset(self):
        """After _reset(), next access calls factory again."""
        call_count = 0

        class Obj:
            x = 1

        def factory():
            nonlocal call_count
            call_count += 1
            return Obj()

        proxy = LazyProxy(factory)
        _ = proxy.x
        assert call_count == 1
        proxy.reset()
        _ = proxy.x
        assert call_count == 2

    def testset_instance(self):
        """set_instance replaces the cached object."""
        class Obj:
            x = 1

        class Replacement:
            x = 99

        proxy = LazyProxy(Obj)
        _ = proxy.x
        proxy.set_instance(Replacement())
        assert proxy.x == 99
