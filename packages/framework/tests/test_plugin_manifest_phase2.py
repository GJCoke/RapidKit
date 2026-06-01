"""Phase 2 PluginManifest extension tests."""

from unittest.mock import MagicMock

from rapidkit_framework.loader import apply_dependency_overrides, mount_plugin_middlewares
from rapidkit_framework.plugin import MiddlewareDef, PluginManifest


class TestMiddlewareDef:
    def test_create_with_defaults(self):
        """MiddlewareDef with just cls has default kwargs and order."""

        class FakeMiddleware:
            pass

        md = MiddlewareDef(cls=FakeMiddleware)
        assert md.cls is FakeMiddleware
        assert md.kwargs == {}
        assert md.order == 0

    def test_create_with_all_fields(self):
        """MiddlewareDef with explicit kwargs and order."""

        class FakeMiddleware:
            pass

        md = MiddlewareDef(cls=FakeMiddleware, kwargs={"timeout": 30}, order=-10)
        assert md.kwargs == {"timeout": 30}
        assert md.order == -10


class TestPluginManifestNewFields:
    def test_dependency_overrides_default_empty(self):
        """dependency_overrides defaults to empty dict."""
        m = PluginManifest(name="test", version="1.0")
        assert m.dependency_overrides == {}

    def test_middlewares_default_empty(self):
        """middlewares defaults to empty list."""
        m = PluginManifest(name="test", version="1.0")
        assert m.middlewares == []

    def test_dependency_overrides_with_values(self):
        """dependency_overrides can hold callable mappings."""

        async def placeholder():
            pass

        async def real_impl():
            pass

        m = PluginManifest(
            name="test",
            version="1.0",
            dependency_overrides={placeholder: real_impl},
        )
        assert m.dependency_overrides[placeholder] is real_impl

    def test_middlewares_with_values(self):
        """middlewares can hold MiddlewareDef instances."""

        class FakeMiddleware:
            pass

        md = MiddlewareDef(cls=FakeMiddleware, order=-5)
        m = PluginManifest(name="test", version="1.0", middlewares=[md])
        assert len(m.middlewares) == 1
        assert m.middlewares[0].order == -5

    def test_new_fields_backward_compatible(self):
        """Existing manifests without new fields still work."""
        m = PluginManifest(
            name="auth",
            version="0.1.0",
            dependencies=["other"],
            required=True,
        )
        assert m.dependency_overrides == {}
        assert m.middlewares == []


class TestApplyDependencyOverrides:
    def test_applies_overrides_in_order(self):
        """Overrides from plugins are applied to app in topological order."""

        async def placeholder_a():
            pass

        async def real_a():
            pass

        async def placeholder_b():
            pass

        async def real_b():
            pass

        plugins = [
            PluginManifest(name="a", version="1.0", dependency_overrides={placeholder_a: real_a}),
            PluginManifest(name="b", version="1.0", dependency_overrides={placeholder_b: real_b}),
        ]

        app = MagicMock()
        app.dependency_overrides = {}
        apply_dependency_overrides(app, plugins)

        assert app.dependency_overrides[placeholder_a] is real_a
        assert app.dependency_overrides[placeholder_b] is real_b

    def test_no_overrides_is_noop(self):
        """Plugins without dependency_overrides don't modify app."""
        plugins = [PluginManifest(name="a", version="1.0")]

        app = MagicMock()
        app.dependency_overrides = {}
        apply_dependency_overrides(app, plugins)

        assert app.dependency_overrides == {}

    def test_later_plugin_can_override_same_key(self):
        """If two plugins override the same key, last in topo order wins."""

        async def placeholder():
            pass

        async def impl_a():
            pass

        async def impl_b():
            pass

        plugins = [
            PluginManifest(name="a", version="1.0", dependency_overrides={placeholder: impl_a}),
            PluginManifest(name="b", version="1.0", dependency_overrides={placeholder: impl_b}),
        ]

        app = MagicMock()
        app.dependency_overrides = {}
        apply_dependency_overrides(app, plugins)

        assert app.dependency_overrides[placeholder] is impl_b


class TestMountPluginMiddlewares:
    def test_middlewares_sorted_by_order(self):
        """Middlewares are mounted sorted by order (ascending), LIFO means smallest order mounted last."""

        class MW_A:
            pass

        class MW_B:
            pass

        class MW_C:
            pass

        plugins = [
            PluginManifest(
                name="a",
                version="1.0",
                middlewares=[
                    MiddlewareDef(cls=MW_A, order=0),
                ],
            ),
            PluginManifest(
                name="b",
                version="1.0",
                middlewares=[
                    MiddlewareDef(cls=MW_B, order=-10),
                    MiddlewareDef(cls=MW_C, order=10),
                ],
            ),
        ]

        app = MagicMock()
        mount_plugin_middlewares(app, plugins)

        # Starlette LIFO: mount in descending order so smallest order ends up outermost
        # order=10 mounted first, order=0 next, order=-10 last (closest to request)
        calls = app.add_middleware.call_args_list
        assert len(calls) == 3
        assert calls[0][0][0] is MW_C  # order=10
        assert calls[1][0][0] is MW_A  # order=0
        assert calls[2][0][0] is MW_B  # order=-10

    def test_kwargs_passed_to_add_middleware(self):
        """MiddlewareDef kwargs are forwarded to app.add_middleware."""

        class FakeMW:
            pass

        plugins = [
            PluginManifest(
                name="a",
                version="1.0",
                middlewares=[
                    MiddlewareDef(cls=FakeMW, kwargs={"timeout": 30, "debug": True}),
                ],
            ),
        ]

        app = MagicMock()
        mount_plugin_middlewares(app, plugins)

        app.add_middleware.assert_called_once_with(FakeMW, timeout=30, debug=True)

    def test_no_middlewares_is_noop(self):
        """Plugins without middlewares don't call add_middleware."""
        plugins = [PluginManifest(name="a", version="1.0")]

        app = MagicMock()
        mount_plugin_middlewares(app, plugins)

        app.add_middleware.assert_not_called()

    def test_same_order_preserves_topo_order(self):
        """Middlewares with same order are mounted in plugin topological order."""

        class MW_A:
            pass

        class MW_B:
            pass

        plugins = [
            PluginManifest(name="a", version="1.0", middlewares=[MiddlewareDef(cls=MW_A, order=0)]),
            PluginManifest(name="b", version="1.0", middlewares=[MiddlewareDef(cls=MW_B, order=0)]),
        ]

        app = MagicMock()
        mount_plugin_middlewares(app, plugins)

        calls = app.add_middleware.call_args_list
        assert len(calls) == 2
        # Same order: topo order reversed for LIFO -> b first, a last
        assert calls[0][0][0] is MW_B
        assert calls[1][0][0] is MW_A
