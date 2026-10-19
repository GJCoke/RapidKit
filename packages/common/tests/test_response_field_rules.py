# packages/common/tests/test_response_field_rules.py
"""BaseResponse：来自受控模型 ORM 对象的数据按请求字段规则脱敏 / 移除。"""

import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient
from httpx import ASGITransport, AsyncClient
from rapidkit_common.models import SQLModel
from rapidkit_common.schemas.response import BaseResponse, Response
from rapidkit_common.scope_runtime import ScopeContextMiddleware, get_field_rules, set_field_rules


class RuleUser(SQLModel, table=True):
    __tablename__ = "response_rule_users"

    name: str
    phone: str | None = None
    email: str = ""


class RuleDept(SQLModel, table=True):
    __tablename__ = "response_rule_depts"

    name: str
    leader_phone: str | None = None


class DeptOut(BaseResponse):
    name: str
    leader_phone: str | None = None


class UserOut(BaseResponse):
    name: str
    phone: str | None = None
    email: str
    dept: DeptOut | None = None


RULES = {RuleUser: {"phone": "hidden", "email": "masked"}, RuleDept: {"leader_phone": "masked"}}


@pytest.fixture(autouse=True)
def _reset_rules():
    set_field_rules({})
    yield
    set_field_rules({})


def test_orm_sourced_model_applies_rules():
    set_field_rules(RULES)
    out = UserOut.model_validate(RuleUser(name="张三", phone="13800138000", email="zs@example.com"))
    assert out.model_dump(by_alias=True) == {"name": "张三", "email": "z***@example.com", "dept": None}


def test_dict_input_is_not_processed():
    set_field_rules(RULES)
    out = UserOut.model_validate({"name": "张三", "phone": "13800138000", "email": "zs@example.com"})
    assert out.model_dump(by_alias=True)["phone"] == "13800138000"


def test_nested_orm_object_applies_its_own_rules():
    set_field_rules(RULES)
    dept = DeptOut.model_validate(RuleDept(name="研发", leader_phone="13900139000"))
    out = UserOut.model_validate({"name": "张三", "email": "zs@example.com", "dept": dept})
    dumped = out.model_dump(by_alias=True)
    assert dumped["dept"] == {"name": "研发", "leaderPhone": "139****9000"}
    assert dumped["email"] == "zs@example.com"


def test_no_rules_keeps_values():
    out = UserOut.model_validate(RuleUser(name="张三", phone="13800138000", email="zs@example.com"))
    assert out.model_dump()["phone"] == "13800138000"


def test_fastapi_response_drops_hidden_required_field():
    app = FastAPI()

    async def bind_rules() -> None:
        set_field_rules({RuleUser: {"email": "hidden"}})

    @app.get("/user", dependencies=[Depends(bind_rules)])
    async def get_user() -> Response[UserOut]:
        return Response(data=UserOut.model_validate(RuleUser(name="张三", email="zs@example.com")))

    body = TestClient(app).get("/user").json()
    assert body["data"] == {"name": "张三", "phone": None, "dept": None}


@pytest.mark.asyncio
async def test_field_context_is_isolated_and_restored_for_each_request():
    app = FastAPI()
    app.add_middleware(ScopeContextMiddleware)

    @app.get("/restricted")
    async def restricted() -> Response[UserOut]:
        set_field_rules({RuleUser: {"email": "hidden"}})
        return Response(data=UserOut.model_validate(RuleUser(name="张三", email="zs@example.com")))

    @app.get("/public")
    async def public() -> Response[UserOut]:
        return Response(data=UserOut.model_validate(RuleUser(name="张三", email="zs@example.com")))

    set_field_rules({RuleUser: {"phone": "hidden"}})
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        assert "email" not in (await client.get("/restricted")).json()["data"]
        assert get_field_rules() == {RuleUser: {"phone": "hidden"}}
        assert (await client.get("/public")).json()["data"]["email"] == "zs@example.com"
        assert get_field_rules() == {RuleUser: {"phone": "hidden"}}
