"""declared_access 测试辅助的测试。"""

from fastapi import APIRouter, Depends
from rapidkit_common.access import Authenticated, Public, Require
from rapidkit_common.auth import DenyImpersonation

from tests.testing.access import declared_access


def test_declared_access_labels_each_route():
    router = APIRouter(prefix="/items")

    @router.get("", dependencies=[Require("item:read")])
    async def listed() -> None:
        return None

    @router.get("/me", dependencies=[Authenticated])
    async def me() -> None:
        return None

    @router.post("/login", dependencies=[Public, Depends(DenyImpersonation)])
    async def login() -> None:
        return None

    @router.get("/naked")
    async def naked() -> None:
        return None

    assert declared_access(router) == {
        "GET:/api/v1/items": "require:item:read",
        "GET:/api/v1/items/me": "authenticated",
        "POST:/api/v1/items/login": "public+deny-impersonation",
        "GET:/api/v1/items/naked": "none",
    }
