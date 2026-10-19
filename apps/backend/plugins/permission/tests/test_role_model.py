# apps/backend/plugins/permission/tests/test_role_model.py
"""Role 权限码字段测试。"""

from plugin_permission.models import Role


def test_role_permission_codes_default_empty():
    role = Role(name="editor", code="editor", description="")

    assert role.permission_codes == []


def test_role_permission_codes_roundtrip():
    role = Role(name="editor", code="editor", permission_codes=["user:read"])

    assert role.permission_codes == ["user:read"]


def test_role_and_package_scope_columns_default_to_empty():
    from plugin_permission.models import Role
    from plugin_permission.package.models import PermissionPackage

    role = Role(name="编辑者", code="R_EDITOR")
    package = PermissionPackage(key="custom.x", label="x", codes=["role:read"])
    assert role.data_scopes == {} and role.field_modes == {}
    assert package.data_scopes == {} and package.field_modes == {}
    for table in (Role.__table__, PermissionPackage.__table__):
        assert not table.c.data_scopes.nullable and not table.c.field_modes.nullable


def test_role_versions_module_exports_helpers():
    from plugin_permission import role_versions

    assert role_versions.role_version_key("ADMIN") == "auth:role_version:ADMIN"
