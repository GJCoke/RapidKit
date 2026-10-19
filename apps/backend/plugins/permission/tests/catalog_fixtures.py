# apps/backend/plugins/permission/tests/catalog_fixtures.py
"""测试用权限码目录。"""

from uuid import UUID

from rapidkit_common.models import SQLModel
from rapidkit_framework.plugin import PermissionCodeDef, PluginManifest, ResourceDef
from rapidkit_framework.scopes import FieldGroupDef, dept, dept_subtree, self_only

from plugin_permission.catalog.registry import PermissionCatalog, build_catalog, set_catalog

DEFAULT_BINDINGS = {
    "GET:/api/v1/users": "user:read",
    "PUT:/api/v1/users/{user_id}": "user:update",
    "DELETE:/api/v1/users/{user_id}": "user:delete",
    "GET:/api/v1/departments/tree": "department:read",
    "GET:/api/v1/roles/all": "role:read",
}


def make_catalog(bindings: dict[str, str] | None = None) -> PermissionCatalog:
    """构建包含 user / department / role 三个资源的小型目录。"""
    manifest = PluginManifest(
        name="fake",
        version="0.0.0",
        resources=[
            ResourceDef(key="user", label="用户"),
            ResourceDef(key="department", label="部门"),
            ResourceDef(key="role", label="角色"),
        ],
        permission_codes=[
            PermissionCodeDef(code="user:read", label="查看用户", abac_action="read"),
            PermissionCodeDef(
                code="user:update",
                label="编辑用户",
                abac_action="write",
                depends=("user:read", "department:read"),
            ),
            PermissionCodeDef(code="user:delete", label="删除用户", abac_action="write"),
            PermissionCodeDef(code="department:read", label="查看部门", abac_action="read"),
            PermissionCodeDef(code="role:read", label="查看角色", abac_action="read"),
        ],
    )
    return build_catalog([manifest], DEFAULT_BINDINGS if bindings is None else bindings)


def install_catalog(bindings: dict[str, str] | None = None) -> PermissionCatalog:
    """构建并设为当前目录。"""
    catalog = make_catalog(bindings)
    set_catalog(catalog)
    return catalog


class ScopedFixtureItem(SQLModel, table=True):
    """声明了数据范围与字段组的测试模型。"""

    __tablename__ = "permission_fixture_items"

    owner_id: UUID | None = None
    department_id: UUID | None = None
    phone: str | None = None
    email: str | None = None
    remark: str | None = None


class OtherFixtureItem(SQLModel, table=True):
    """用于"列不属于资源模型"校验的测试模型。"""

    __tablename__ = "permission_fixture_others"

    owner_id: UUID | None = None


def scoped_resource(**overrides) -> ResourceDef:
    """``item`` 资源：范围 dept_subtree / dept / self，字段组 contact（phone、email）与 note（remark，仅隐藏）。"""
    values = {
        "key": "item",
        "label": "条目",
        "model": ScopedFixtureItem,
        "data_scopes": (
            dept_subtree(ScopedFixtureItem.department_id),
            dept(ScopedFixtureItem.department_id),
            self_only(ScopedFixtureItem.owner_id),
        ),
        "field_groups": (
            FieldGroupDef("contact", "联系方式", fields=("phone", "email")),
            FieldGroupDef("note", "备注", fields=("remark",), modes=("hidden",)),
        ),
    }
    values.update(overrides)
    return ResourceDef(**values)


def make_scoped_catalog(resource: ResourceDef | None = None) -> PermissionCatalog:
    """包含受控资源 ``item`` 与不受控资源 ``plain`` 的目录。"""
    manifest = PluginManifest(
        name="scoped",
        version="0.0.0",
        resources=[resource or scoped_resource(), ResourceDef(key="plain", label="普通")],
        permission_codes=[
            PermissionCodeDef(code="item:read", label="查看条目", abac_action="read"),
            PermissionCodeDef(code="item:update", label="编辑条目", abac_action="write", depends=("item:read",)),
            PermissionCodeDef(code="plain:read", label="查看普通", abac_action="read"),
        ],
    )
    return build_catalog(
        [manifest],
        {
            "GET:/api/v1/items": "item:read",
            "PUT:/api/v1/items/{item_id}": "item:update",
            "GET:/api/v1/plain": "plain:read",
        },
    )
