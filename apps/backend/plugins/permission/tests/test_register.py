"""Test plugin registration."""

from plugin_permission import register
from plugin_permission.extension.models import PermissionExtension
from plugin_permission.models import InterfaceRouter, Role
from plugin_permission.package.models import PermissionPackage
from rapidkit_framework.plugin import PluginManifest


def test_register_returns_manifest():
    manifest = register()
    assert isinstance(manifest, PluginManifest)
    assert manifest.name == "permission"
    assert manifest.version == "0.1.0"
    assert manifest.router is not None
    assert set(manifest.models) == {Role, InterfaceRouter, PermissionExtension, PermissionPackage}


def test_register_includes_permission_extension_model():
    manifest = register()
    assert PermissionExtension in manifest.models
    assert PermissionPackage in manifest.models
    assert PermissionExtension.__tablename__ == "permission_extensions"
