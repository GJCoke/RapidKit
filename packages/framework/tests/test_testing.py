"""Test the testing utilities themselves."""

from typing import Protocol

from rapidkit_framework.testing import create_test_registry


class DummyProtocol(Protocol):
    def do(self) -> str: ...


class DummyImpl:
    def do(self) -> str:
        return "done"


def test_create_test_registry_is_isolated():
    r1 = create_test_registry()
    r2 = create_test_registry()
    r1.register(DummyProtocol, DummyImpl())
    assert r2.get_optional(DummyProtocol) is None


def test_create_test_registry_works():
    r = create_test_registry()
    r.register(DummyProtocol, DummyImpl())
    assert r.get(DummyProtocol).do() == "done"
