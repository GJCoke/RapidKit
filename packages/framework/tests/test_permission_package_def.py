"""PermissionPackageDef declaration tests."""

import pytest
from rapidkit_framework.plugin import PermissionPackageDef, PluginManifest


def test_valid_package_def():
    pkg = PermissionPackageDef(key="user.full", label="用户 · 完整", codes=("user:read", "user:update"))
    assert pkg.description == ""


@pytest.mark.parametrize("key", ["", "user", "User.full", "custom.mine", "user.full.extra", "user_x.full"])
def test_invalid_key_rejected(key):
    with pytest.raises(ValueError):
        PermissionPackageDef(key=key, label="x", codes=("user:read",))


def test_empty_codes_rejected():
    with pytest.raises(ValueError):
        PermissionPackageDef(key="user.readonly", label="x", codes=())


def test_duplicate_codes_rejected():
    with pytest.raises(ValueError):
        PermissionPackageDef(key="user.readonly", label="x", codes=("user:read", "user:read"))



def test_manifest_defaults_to_no_packages():
    manifest = PluginManifest(name="demo", version="0.1.0")
    assert manifest.permission_packages == []
