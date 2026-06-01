"""Test plugin registration."""

from plugin_department import register
from rapidkit_framework.plugin import PluginManifest


def test_register_returns_manifest():
    manifest = register()
    assert isinstance(manifest, PluginManifest)
    assert manifest.name == "department"
    assert manifest.version == "0.1.0"
    assert manifest.router is not None
    assert len(manifest.models) == 1
