# packages/common/tests/test_access_serialize.py
"""Scope.serialize：手工构造的数据按当前请求字段规则处理。"""

from types import SimpleNamespace

from rapidkit_common.access import Scope
from rapidkit_common.models import SQLModel
from rapidkit_common.scope_runtime import set_field_rules


class SerializeUser(SQLModel, table=True):
    __tablename__ = "access_serialize_users"

    phone: str | None = None


def test_serialize_applies_rules_for_model():
    scope = Scope(user=SimpleNamespace(), code="user:read")
    set_field_rules({SerializeUser: {"phone": "masked"}})
    try:
        assert scope.serialize({"phone": "13800138000", "name": "n"}, SerializeUser) == {
            "phone": "138****8000",
            "name": "n",
        }
    finally:
        set_field_rules({})
