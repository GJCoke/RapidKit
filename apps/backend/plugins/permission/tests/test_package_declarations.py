"""功能包资源与码声明测试。"""

from plugin_permission import register
from plugin_permission.package.declarations import PACKAGE_CODES, PACKAGE_RESOURCES
from plugin_permission.package.sync import sync_builtin_packages_on_startup


def test_package_resource_and_codes_declared():
    manifest = register()
    resource_keys = {resource.key for resource in manifest.resources}
    codes = {code.code: code for code in manifest.permission_codes}
    assert "permission-package" in resource_keys
    for code in ("permission-package:read", "permission-package:create", "permission-package:update",
                 "permission-package:delete"):
        assert code in codes
    assert {code.code for code in PACKAGE_CODES} <= set(codes)
    assert {resource.key for resource in PACKAGE_RESOURCES} <= resource_keys


def test_role_grant_depends_on_package_read():
    codes = {code.code: code for code in register().permission_codes}
    assert "permission-package:read" in codes["role:grant"].depends


def test_sync_runs_after_catalog_build():
    on_startup = register().on_startup
    assert on_startup[-1] is sync_builtin_packages_on_startup
