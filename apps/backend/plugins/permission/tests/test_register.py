"""Plugin registration contains only live permission models."""

from plugin_permission import register
from plugin_permission.models import Role
from rapidkit_framework.plugin import PluginManifest


def test_register_returns_manifest():
    manifest = register()
    assert isinstance(manifest, PluginManifest)
    assert manifest.name == "permission"
    assert manifest.router is not None
    assert set(manifest.models) == {Role}
