"""EventBus 测试。"""

import pytest


class TestEventBus:
    def test_emit_calls_all_handlers(self):
        from rapidkit_core.events import EventBus

        bus = EventBus()
        results = []
        bus.on("test.event", lambda data: results.append(f"h1:{data}"))
        bus.on("test.event", lambda data: results.append(f"h2:{data}"))
        bus.emit("test.event", "payload")
        assert results == ["h1:payload", "h2:payload"]

    def test_handler_exception_does_not_affect_others(self):
        from rapidkit_core.events import EventBus

        bus = EventBus()
        results = []

        def bad_handler(data):
            raise ValueError("boom")

        bus.on("test.event", bad_handler)
        bus.on("test.event", lambda data: results.append("ok"))
        bus.emit("test.event", "x")
        assert results == ["ok"]

    def test_no_subscribers_no_error(self):
        from rapidkit_core.events import EventBus

        bus = EventBus()
        bus.emit("nonexistent.event", "data")  # should not raise

    def test_allowed_sources_filter(self):
        from rapidkit_core.events import EventBus

        bus = EventBus()
        results = []
        bus.on("test.event", lambda data: results.append(data), allowed_sources=["plugin_a"])
        bus.emit("test.event", "from_a", source="plugin_a")
        bus.emit("test.event", "from_b", source="plugin_b")
        assert results == ["from_a"]

    def test_allowed_sources_none_accepts_all(self):
        from rapidkit_core.events import EventBus

        bus = EventBus()
        results = []
        bus.on("test.event", lambda data: results.append(data))
        bus.emit("test.event", "a", source="x")
        bus.emit("test.event", "b", source="y")
        assert results == ["a", "b"]

    @pytest.mark.asyncio
    async def test_async_handler(self):
        from rapidkit_core.events import EventBus

        bus = EventBus()
        results = []

        async def async_handler(data):
            results.append(f"async:{data}")

        bus.on("test.event", async_handler)
        await bus.async_emit("test.event", "payload")
        assert results == ["async:payload"]

    @pytest.mark.asyncio
    async def test_async_emit_mixed_handlers(self):
        from rapidkit_core.events import EventBus

        bus = EventBus()
        results = []

        bus.on("test.event", lambda data: results.append(f"sync:{data}"))

        async def async_handler(data):
            results.append(f"async:{data}")

        bus.on("test.event", async_handler)
        await bus.async_emit("test.event", "x")
        assert "sync:x" in results
        assert "async:x" in results
