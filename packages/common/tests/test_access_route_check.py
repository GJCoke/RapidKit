"""has_route_access 测试。"""

from types import SimpleNamespace

from rapidkit_common.access import has_route_access


def _request(ctx):
    return SimpleNamespace(state=SimpleNamespace(permission_ctx=ctx) if ctx is not None else SimpleNamespace())


def test_without_context_denies():
    assert has_route_access(_request(None), "GET:/x") is False


def test_delegates_to_context():
    ctx = SimpleNamespace(allows_route=lambda key: key == "GET:/x")

    assert has_route_access(_request(ctx), "GET:/x") is True
    assert has_route_access(_request(ctx), "GET:/y") is False
