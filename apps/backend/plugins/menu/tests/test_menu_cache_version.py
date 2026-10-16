"""菜单缓存版本化测试。"""

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from plugin_menu import services
from plugin_menu.route_schemas import UserRouteResponse

pytestmark = pytest.mark.asyncio


def _redis(version: str = "9") -> AsyncMock:
    redis = AsyncMock()
    redis.get.return_value = None
    redis.mget.return_value = [version]
    redis.lock = MagicMock(return_value=MagicMock(acquire=AsyncMock(return_value=True), release=AsyncMock()))
    return redis


async def test_invalidate_bumps_version_without_scan():
    redis = AsyncMock()
    redis.incr.return_value = 10

    await services.invalidate_menu_cache(redis)

    redis.incr.assert_awaited_once_with("plugin:menu:version")
    redis.scan.assert_not_awaited()


async def test_user_route_key_includes_version(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(services, "get_user_routes", AsyncMock(return_value=UserRouteResponse(routes=[], home="home")))
    redis = _redis("9")

    await services.get_cached_user_routes(SimpleNamespace(is_admin=False, roles=["a"]), redis, AsyncMock())

    key = redis.get.await_args_list[0].args[0]
    assert key.startswith("plugin:menu:v9:route:user:non-admin:")
    assert redis.set.await_args.args[0] == key


async def test_publish_menu_change_bumps_then_pushes(monkeypatch: pytest.MonkeyPatch):
    order: list[str] = []
    monkeypatch.setattr(services, "invalidate_menu_cache", AsyncMock(side_effect=lambda redis: order.append("bump")))
    monkeypatch.setattr(services, "emit_permission_changed", AsyncMock(side_effect=lambda scope: order.append(scope)))

    await services.publish_menu_change(object())

    assert order == ["bump", "menu"]
