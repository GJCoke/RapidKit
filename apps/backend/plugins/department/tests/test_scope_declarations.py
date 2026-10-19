# apps/backend/plugins/department/tests/test_scope_declarations.py
"""部门资源的数据范围声明通过目录校验，"本部门及以下"允许子树内新建子部门。"""

from uuid import uuid4

from plugin_department.permissions import RESOURCES
from plugin_permission.catalog.registry import build_catalog
from rapidkit_framework.plugin import PluginManifest
from rapidkit_framework.scopes import ScopeContext


def test_department_resource_declarations_are_valid():
    catalog = build_catalog([PluginManifest(name="department", version="0", resources=RESOURCES)], {})
    department = catalog.resources["department"]
    assert [(s.key, s.label) for s in department.data_scopes] == [("dept_subtree", "本部门及以下"), ("dept", "仅本部门")]
    assert department.field_groups == ()


def test_dept_subtree_also_matches_parent_in_subtree():
    scope = RESOURCES[0].data_scopes[0]
    root = uuid4()
    expr = str(scope.build(ScopeContext(user_id=uuid4(), department_id=root, dept_subtree_ids=(root,))))
    assert "dept_departments.id IN" in expr
    assert " OR dept_departments.parent_id IN" in expr
    assert str(scope.build(ScopeContext(user_id=uuid4()))) == "false"
