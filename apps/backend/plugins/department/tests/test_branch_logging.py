from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from plugin_department import providers
from tests.testing.utils import one_event


def test_missing_root(json_log):
    root = uuid4()
    assert providers.collect_subtree_ids([], root) == []
    row = one_event(json_log(), "department.tree.degraded")
    assert (row["level"], row["outcome"], row["reason_code"], row["resource_type"], row["resource_id"]) == (
        "WARNING",
        "degraded",
        "dept_root_not_found",
        "department",
        str(root),
    )
    assert "private-" not in str(json_log())


@pytest.mark.parametrize("ancestors", [False, True])
async def test_tree_cycle(ancestors, monkeypatch, json_log):
    a, b = uuid4(), uuid4()
    pairs = [(a, b), (b, a)]
    if ancestors:
        resolver = providers.DepartmentResolverImpl()
        monkeypatch.setattr(resolver, "_pairs", AsyncMock(return_value=pairs))
        assert await resolver.get_ancestor_ids(a) == [b, a]
        repeated = b
    else:
        assert providers.collect_subtree_ids(pairs, a) == [a, b]
        repeated = a
    row = one_event(json_log(), "department.tree.degraded")
    assert (row["level"], row["outcome"], row["reason_code"], row["resource_type"], row["resource_id"]) == (
        "WARNING",
        "degraded",
        "dept_cycle_detected",
        "department",
        str(repeated),
    )
    assert "private-" not in str(json_log())
