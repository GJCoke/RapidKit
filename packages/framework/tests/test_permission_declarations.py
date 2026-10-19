"""资源与权限码声明类型测试。"""

import dataclasses

import pytest
from rapidkit_framework.plugin import PermissionCodeDef, PluginManifest, ResourceDef
from sqlmodel import Field, SQLModel


class _Item(SQLModel, table=True):
    __tablename__ = "framework_test_items"

    id: int | None = Field(default=None, primary_key=True)


def test_resource_def_defaults():
    resource = ResourceDef(key="item", label="条目")
    assert resource.model is None
    assert resource.data_scopes == ()
    assert resource.field_groups == ()


def test_resource_def_keeps_model():
    resource = ResourceDef(key="item", label="条目", model=_Item)
    assert resource.model is _Item


def test_permission_code_def_defaults_to_no_depends():
    code = PermissionCodeDef(code="item:read", label="查看条目", abac_action="read")
    assert code.depends == ()


def test_declarations_are_frozen():
    code = PermissionCodeDef(code="item:read", label="查看条目", abac_action="read")
    with pytest.raises(dataclasses.FrozenInstanceError):
        code.code = "item:write"  # ty: ignore[invalid-assignment]


def test_manifest_collects_resources_and_codes():
    resource = ResourceDef(key="item", label="条目")
    code = PermissionCodeDef(code="item:read", label="查看条目", abac_action="read")
    manifest = PluginManifest(name="items", version="0.1.0", resources=[resource], permission_codes=[code])
    assert manifest.resources == [resource]
    assert manifest.permission_codes == [code]


def test_manifest_defaults_to_empty_declarations():
    manifest = PluginManifest(name="items", version="0.1.0")
    assert manifest.resources == []
    assert manifest.permission_codes == []
