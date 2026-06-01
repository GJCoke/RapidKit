"""EventBus 测试。"""

import asyncio
from dataclasses import dataclass
from typing import ClassVar

import pytest
from rapidkit_framework.events import Event, EventBus


@dataclass
class FakeEvent(Event):
    event_name: ClassVar[str] = "test.fake"
    value: str = ""


@dataclass
class AnotherEvent(Event):
    event_name: ClassVar[str] = "test.another"
    value: str = ""


@pytest.fixture(autouse=True)
def _reset_bus():
    """每个测试前重置单例，测试后恢复。"""
    EventBus._reset()
    bus = EventBus()
    yield bus
    EventBus._reset()
    # 恢复全局 event_bus 单例
    import rapidkit_framework.events as mod

    mod.event_bus = EventBus()


class TestSingleton:
    def test_second_init_raises(self):
        with pytest.raises(RuntimeError, match="singleton"):
            EventBus()

    def test_reset_allows_recreation(self):
        EventBus._reset()
        bus = EventBus()
        assert bus is not None


class TestEmit:
    def test_emit_calls_all_handlers(self, _reset_bus):
        bus = _reset_bus
        results = []
        bus.on(FakeEvent, lambda e: results.append(f"h1:{e.value}"))
        bus.on(FakeEvent, lambda e: results.append(f"h2:{e.value}"))
        bus.emit(FakeEvent(value="payload"))
        assert results == ["h1:payload", "h2:payload"]

    def test_handler_exception_does_not_affect_others(self, _reset_bus):
        bus = _reset_bus
        results = []

        def bad_handler(e):
            raise ValueError("boom")

        bus.on(FakeEvent, bad_handler)
        bus.on(FakeEvent, lambda e: results.append("ok"))
        bus.emit(FakeEvent(value="x"))
        assert results == ["ok"]

    def test_no_subscribers_no_error(self, _reset_bus):
        bus = _reset_bus
        bus.emit(FakeEvent(value="data"))  # should not raise

    def test_allowed_sources_filter(self, _reset_bus):
        bus = _reset_bus
        results = []
        bus.on(FakeEvent, lambda e: results.append(e.value), allowed_sources=["plugin_a"])
        bus.emit(FakeEvent(value="from_a"), source="plugin_a")
        bus.emit(FakeEvent(value="from_b"), source="plugin_b")
        assert results == ["from_a"]

    def test_allowed_sources_none_accepts_all(self, _reset_bus):
        bus = _reset_bus
        results = []
        bus.on(FakeEvent, lambda e: results.append(e.value))
        bus.emit(FakeEvent(value="a"), source="x")
        bus.emit(FakeEvent(value="b"), source="y")
        assert results == ["a", "b"]

    def test_sync_emit_skips_async_handler(self, _reset_bus):
        bus = _reset_bus
        results = []

        async def async_handler(e):
            results.append("should_not_run")

        bus.on(FakeEvent, async_handler)
        bus.on(FakeEvent, lambda e: results.append("sync"))
        bus.emit(FakeEvent(value="x"))
        assert results == ["sync"]

    def test_different_event_types_isolated(self, _reset_bus):
        bus = _reset_bus
        results = []
        bus.on(FakeEvent, lambda e: results.append("fake"))
        bus.on(AnotherEvent, lambda e: results.append("another"))
        bus.emit(FakeEvent(value="x"))
        assert results == ["fake"]


class TestAsyncEmit:
    @pytest.mark.asyncio
    async def test_async_handler(self, _reset_bus):
        bus = _reset_bus
        results = []

        async def async_handler(e):
            results.append(f"async:{e.value}")

        bus.on(FakeEvent, async_handler)
        await bus.async_emit(FakeEvent(value="payload"))
        assert results == ["async:payload"]

    @pytest.mark.asyncio
    async def test_async_emit_mixed_handlers(self, _reset_bus):
        bus = _reset_bus
        results = []

        bus.on(FakeEvent, lambda e: results.append(f"sync:{e.value}"))

        async def async_handler(e):
            results.append(f"async:{e.value}")

        bus.on(FakeEvent, async_handler)
        await bus.async_emit(FakeEvent(value="x"))
        assert "sync:x" in results
        assert "async:x" in results

    @pytest.mark.asyncio
    async def test_concurrent_execution_same_priority(self, _reset_bus):
        bus = _reset_bus
        order = []

        async def slow_handler(e):
            await asyncio.sleep(0.05)
            order.append("slow")

        async def fast_handler(e):
            order.append("fast")

        bus.on(FakeEvent, slow_handler, priority=0)
        bus.on(FakeEvent, fast_handler, priority=0)
        await bus.async_emit(FakeEvent(value="x"))
        # fast 应该先完成（并发执行）
        assert order == ["fast", "slow"]

    @pytest.mark.asyncio
    async def test_priority_ordering(self, _reset_bus):
        bus = _reset_bus
        order = []

        bus.on(FakeEvent, lambda e: order.append("low"), priority=10)
        bus.on(FakeEvent, lambda e: order.append("high"), priority=-10)
        bus.on(FakeEvent, lambda e: order.append("default"), priority=0)
        await bus.async_emit(FakeEvent(value="x"))
        assert order == ["high", "default", "low"]


class TestPattern:
    def test_pattern_match(self, _reset_bus):
        bus = _reset_bus
        results = []
        bus.on_pattern("test.*", lambda e: results.append(e.value))
        bus.emit(FakeEvent(value="matched"))
        assert results == ["matched"]

    def test_pattern_no_match(self, _reset_bus):
        bus = _reset_bus
        results = []
        bus.on_pattern("other.*", lambda e: results.append(e.value))
        bus.emit(FakeEvent(value="nope"))
        assert results == []

    def test_wildcard_all(self, _reset_bus):
        bus = _reset_bus
        results = []
        bus.on_pattern("*", lambda e: results.append(type(e).__name__))
        bus.emit(FakeEvent(value="a"))
        bus.emit(AnotherEvent(value="b"))
        assert results == ["FakeEvent", "AnotherEvent"]


class TestFireAndForget:
    @pytest.mark.asyncio
    async def test_fire_and_forget_executes(self, _reset_bus):
        bus = _reset_bus
        results = []

        async def handler(e):
            results.append(e.value)

        bus.on(FakeEvent, handler)
        bus.fire_and_forget(FakeEvent(value="ff"))
        await bus.shutdown(timeout=2.0)
        assert results == ["ff"]

    @pytest.mark.asyncio
    async def test_shutdown_waits_for_pending(self, _reset_bus):
        bus = _reset_bus
        results = []

        async def slow_handler(e):
            await asyncio.sleep(0.1)
            results.append("done")

        bus.on(FakeEvent, slow_handler)
        bus.fire_and_forget(FakeEvent(value="x"))
        assert results == []
        await bus.shutdown(timeout=2.0)
        assert results == ["done"]


class TestDeadLetters:
    def test_emit_without_handler_records_dead_letter(self, _reset_bus):
        bus = _reset_bus
        bus.emit(FakeEvent(value="orphan"))
        assert len(bus.dead_letters) == 1
        assert bus.dead_letters[0].event_name == "test.fake"

    @pytest.mark.asyncio
    async def test_async_emit_without_handler_records_dead_letter(self, _reset_bus):
        bus = _reset_bus
        await bus.async_emit(FakeEvent(value="orphan"))
        assert len(bus.dead_letters) == 1

    def test_dead_letters_ring_buffer_max_100(self, _reset_bus):
        bus = _reset_bus
        for i in range(120):
            bus.emit(FakeEvent(value=str(i)))
        assert len(bus.dead_letters) == 100

    def test_emit_with_handler_no_dead_letter(self, _reset_bus):
        bus = _reset_bus
        bus.on(FakeEvent, lambda e: None)
        bus.emit(FakeEvent(value="handled"))
        assert len(bus.dead_letters) == 0


class TestHandlerErrorStats:
    def test_handler_error_increments_counter(self, _reset_bus):
        bus = _reset_bus

        def bad_handler(e):
            raise ValueError("boom")

        bus.on(FakeEvent, bad_handler)
        bus.emit(FakeEvent(value="x"))
        assert bus.handler_errors.get("test.fake", 0) == 1

    def test_multiple_errors_accumulate(self, _reset_bus):
        bus = _reset_bus

        def bad_handler(e):
            raise ValueError("boom")

        bus.on(FakeEvent, bad_handler)
        bus.emit(FakeEvent(value="x"))
        bus.emit(FakeEvent(value="y"))
        assert bus.handler_errors["test.fake"] == 2

    @pytest.mark.asyncio
    async def test_async_handler_error_increments_counter(self, _reset_bus):
        bus = _reset_bus

        async def bad_handler(e):
            raise ValueError("boom")

        bus.on(FakeEvent, bad_handler)
        await bus.async_emit(FakeEvent(value="x"))
        assert bus.handler_errors.get("test.fake", 0) == 1

    def test_no_errors_empty_dict(self, _reset_bus):
        bus = _reset_bus
        bus.on(FakeEvent, lambda e: None)
        bus.emit(FakeEvent(value="ok"))
        assert bus.handler_errors == {}
