"""Test PluginManifest provides/requires fields."""

from rapidkit_framework.plugin import PluginManifest


def test_manifest_has_provides_field():
    m = PluginManifest(name="test", version="0.1.0", provides=[str])
    assert m.provides == [str]


def test_manifest_has_requires_field():
    m = PluginManifest(name="test", version="0.1.0", requires=[int])
    assert m.requires == [int]


def test_manifest_has_service_factories_field():
    factory = lambda reg: None  # noqa: E731
    m = PluginManifest(name="test", version="0.1.0", service_factories={str: factory})
    assert str in m.service_factories


def test_manifest_defaults_empty():
    m = PluginManifest(name="test", version="0.1.0")
    assert m.provides == []
    assert m.requires == []
    assert m.service_factories == {}
