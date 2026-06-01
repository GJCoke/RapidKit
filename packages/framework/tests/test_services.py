"""ServiceRegistry unit tests."""

from typing import Protocol

import pytest

from rapidkit_framework.services import ServiceRegistry


class GreeterProtocol(Protocol):
    def greet(self, name: str) -> str: ...


class HelloGreeter:
    def greet(self, name: str) -> str:
        return f"Hello, {name}"


class TestServiceRegistry:
    def setup_method(self):
        self.registry = ServiceRegistry()

    def test_register_and_get(self):
        greeter = HelloGreeter()
        self.registry.register(GreeterProtocol, greeter)
        result = self.registry.get(GreeterProtocol)
        assert result is greeter
        assert result.greet("world") == "Hello, world"

    def test_get_unregistered_raises(self):
        with pytest.raises(RuntimeError, match="GreeterProtocol"):
            self.registry.get(GreeterProtocol)

    def test_get_optional_returns_none(self):
        result = self.registry.get_optional(GreeterProtocol)
        assert result is None

    def test_get_optional_returns_impl(self):
        greeter = HelloGreeter()
        self.registry.register(GreeterProtocol, greeter)
        result = self.registry.get_optional(GreeterProtocol)
        assert result is greeter

    def test_clear(self):
        self.registry.register(GreeterProtocol, HelloGreeter())
        self.registry.clear()
        assert self.registry.get_optional(GreeterProtocol) is None

    def test_register_overwrites(self):
        g1 = HelloGreeter()
        g2 = HelloGreeter()
        self.registry.register(GreeterProtocol, g1)
        self.registry.register(GreeterProtocol, g2)
        assert self.registry.get(GreeterProtocol) is g2
