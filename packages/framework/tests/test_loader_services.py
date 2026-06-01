"""Test service resolution in plugin loading pipeline."""

from typing import Protocol

import pytest

from rapidkit_framework.loader import resolve_services, validate_requires
from rapidkit_framework.plugin import PluginManifest
from rapidkit_framework.services import ServiceRegistry


class FakeProtocol(Protocol):
    def do(self) -> str: ...


class FakeImpl:
    def do(self) -> str:
        return "done"


def test_resolve_services_registers_implementations():
    registry = ServiceRegistry()

    def factory(reg: ServiceRegistry) -> None:
        reg.register(FakeProtocol, FakeImpl())

    manifest = PluginManifest(
        name="test",
        version="0.1.0",
        provides=[FakeProtocol],
        service_factories={FakeProtocol: factory},
    )
    resolve_services(registry, [manifest])
    assert registry.get(FakeProtocol).do() == "done"


def test_validate_requires_passes_when_satisfied():
    manifest = PluginManifest(
        name="consumer",
        version="0.1.0",
        requires=[FakeProtocol],
    )
    provider = PluginManifest(
        name="provider",
        version="0.1.0",
        provides=[FakeProtocol],
    )
    # Should not raise
    validate_requires([manifest, provider])


def test_validate_requires_raises_when_missing():
    manifest = PluginManifest(
        name="consumer",
        version="0.1.0",
        requires=[FakeProtocol],
    )
    with pytest.raises(RuntimeError, match="FakeProtocol"):
        validate_requires([manifest])
