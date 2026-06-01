"""Unit tests for department service functions."""

from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from plugin_department.services import build_tree, check_delete_allowed


class TestBuildTree:
    def _make_dept(self, id, parent_id=None, sort=0):
        dept = MagicMock()
        dept.id = id
        dept.parent_id = parent_id
        dept.sort = sort
        return dept

    @patch("plugin_department.services.DepartmentTreeNode")
    def test_empty_list(self, mock_node_cls):
        result = build_tree([], parent_id=None)
        assert result == []

    @patch("plugin_department.services.DepartmentTreeNode")
    def test_single_root(self, mock_node_cls):
        root_id = uuid4()
        dept = self._make_dept(root_id, parent_id=None, sort=1)

        mock_node = MagicMock()
        mock_node.sort = 1
        mock_node_cls.model_validate.return_value = mock_node

        result = build_tree([dept], parent_id=None)

        assert len(result) == 1
        mock_node_cls.model_validate.assert_called_once_with(dept)

    @patch("plugin_department.services.DepartmentTreeNode")
    def test_nested_children(self, mock_node_cls):
        root_id = uuid4()
        child_id = uuid4()
        root = self._make_dept(root_id, parent_id=None, sort=0)
        child = self._make_dept(child_id, parent_id=root_id, sort=0)

        root_node = MagicMock()
        root_node.sort = 0
        child_node = MagicMock()
        child_node.sort = 0

        mock_node_cls.model_validate.side_effect = [root_node, child_node]

        result = build_tree([root, child], parent_id=None)

        assert len(result) == 1
        assert root_node.children == [child_node]

    @patch("plugin_department.services.DepartmentTreeNode")
    def test_sort_order(self, mock_node_cls):
        id1 = uuid4()
        id2 = uuid4()
        dept1 = self._make_dept(id1, parent_id=None, sort=10)
        dept2 = self._make_dept(id2, parent_id=None, sort=1)

        node1 = MagicMock()
        node1.sort = 10
        node2 = MagicMock()
        node2.sort = 1

        mock_node_cls.model_validate.side_effect = [node1, node2]

        result = build_tree([dept1, dept2], parent_id=None)

        assert result == [node2, node1]


class TestCheckDeleteAllowed:
    @pytest.mark.asyncio
    async def test_raises_when_has_children(self):
        from rapidkit_framework.exceptions import AppException

        from plugin_department.status_codes import DeptStatusCode

        crud = AsyncMock()
        crud.has_children.return_value = True
        dept_id = uuid4()

        with pytest.raises(AppException) as exc_info:
            await check_delete_allowed(crud, dept_id)

        assert exc_info.value.code == DeptStatusCode.HAS_CHILDREN.code

    @pytest.mark.asyncio
    async def test_passes_when_no_children(self):
        crud = AsyncMock()
        crud.has_children.return_value = False
        dept_id = uuid4()

        await check_delete_allowed(crud, dept_id)
        crud.has_children.assert_called_once_with(dept_id)
