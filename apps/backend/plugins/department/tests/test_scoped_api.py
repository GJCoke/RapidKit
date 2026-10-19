"""部门接口在会话范围下的行为（sqlite 内存库，直接调用端点函数）。"""

from uuid import uuid4

import pytest
import pytest_asyncio
from plugin_department.api import create_department, delete_department, get_department_tree, update_department
from plugin_department.crud import DepartmentCRUD
from plugin_department.models import Department
from plugin_department.permissions import RESOURCES
from plugin_department.schemas import DepartmentCreate, DepartmentUpdate
from plugin_department.status_codes import DeptStatusCode
from rapidkit_common.models import SQLModel
from rapidkit_common.scope_runtime import bind_session_scope, install_scope_listeners
from rapidkit_framework.exceptions import AppException
from rapidkit_framework.scopes import ScopeContext
from rapidkit_framework.status_codes import StatusCode
from sqlalchemy.ext.asyncio import create_async_engine
from sqlmodel.ext.asyncio.session import AsyncSession

ROOT, OWN, CHILD, OTHER = uuid4(), uuid4(), uuid4(), uuid4()
SCOPES = {scope.key: scope for scope in RESOURCES[0].data_scopes}


async def _session(engine, scope_key: str) -> AsyncSession:
    session = AsyncSession(engine, expire_on_commit=False)
    ctx = ScopeContext(user_id=uuid4(), department_id=OWN, dept_subtree_ids=(OWN, CHILD))
    bind_session_scope(session, Department, SCOPES[scope_key].build(ctx))
    return session


@pytest_asyncio.fixture
async def engine():
    install_scope_listeners()
    engine = create_async_engine("sqlite+aiosqlite://")
    async with engine.begin() as conn:
        await conn.run_sync(lambda sync: SQLModel.metadata.create_all(sync, tables=[Department.__table__]))
    async with AsyncSession(engine) as setup:
        setup.add_all(
            [
                Department(id=ROOT, name="总公司", code="HQ"),
                Department(id=OWN, parent_id=ROOT, name="研发", code="RD"),
                Department(id=CHILD, parent_id=OWN, name="前端", code="FE"),
                Department(id=OTHER, parent_id=ROOT, name="销售", code="SALES"),
            ]
        )
        await setup.commit()
    yield engine
    await engine.dispose()


async def test_tree_is_filtered_to_subtree(engine):
    async with await _session(engine, "dept_subtree") as session:
        response = await get_department_tree(crud=DepartmentCRUD(session))
    [root] = response.data
    assert (root.code, [child.code for child in root.children]) == ("RD", ["FE"])


async def test_create_under_visible_parent_is_allowed(engine):
    async with await _session(engine, "dept_subtree") as session:
        response = await create_department(
            body=DepartmentCreate(parent_id=CHILD, name="组件", code="UI"), crud=DepartmentCRUD(session), redis=None
        )
    assert response.data.parent_id == CHILD


async def test_create_under_invisible_parent_is_not_found(engine):
    async with await _session(engine, "dept_subtree") as session:
        with pytest.raises(AppException) as exc:
            await create_department(
                body=DepartmentCreate(parent_id=OTHER, name="x", code="X"), crud=DepartmentCRUD(session), redis=None
            )
    assert exc.value.status_code_enum is StatusCode.RESOURCE_NOT_FOUND


async def test_create_top_level_is_out_of_scope(engine):
    async with await _session(engine, "dept_subtree") as session:
        with pytest.raises(AppException) as exc:
            await create_department(
                body=DepartmentCreate(name="x", code="X"), crud=DepartmentCRUD(session), redis=None
            )
    assert exc.value.status_code_enum is StatusCode.RESOURCE_OUT_OF_SCOPE


async def test_move_under_invisible_parent_is_not_found(engine):
    async with await _session(engine, "dept_subtree") as session:
        with pytest.raises(AppException) as exc:
            await update_department(
                dept_id=CHILD, body=DepartmentUpdate(parent_id=OTHER), crud=DepartmentCRUD(session), redis=None
            )
    assert exc.value.status_code_enum is StatusCode.RESOURCE_NOT_FOUND


async def test_delete_outside_scope_is_not_found(engine):
    async with await _session(engine, "dept_subtree") as session:
        with pytest.raises(AppException) as exc:
            await delete_department(dept_id=OTHER, crud=DepartmentCRUD(session), redis=None)
    assert exc.value.status_code_enum is StatusCode.RESOURCE_NOT_FOUND


async def test_delete_checks_children_outside_scope(engine):
    async with await _session(engine, "dept") as session:
        with pytest.raises(AppException) as exc:
            await delete_department(dept_id=OWN, crud=DepartmentCRUD(session), redis=None)
    assert exc.value.status_code_enum is DeptStatusCode.HAS_CHILDREN
