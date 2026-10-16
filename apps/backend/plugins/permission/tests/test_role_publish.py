"""角色变更发布测试。"""

from unittest.mock import AsyncMock, call

from rapidkit_common.events import RoleDeletedEvent, RolePermissionsChangedEvent

from plugin_permission.role import services


async def test_publish_bumps_emits_events_then_pushes(monkeypatch):
    order: list[str] = []
    incr = AsyncMock(side_effect=lambda redis, code: order.append(f"incr:{code}") or 2)
    emit_event = AsyncMock(side_effect=lambda event, source: order.append(type(event).__name__))
    push = AsyncMock(side_effect=lambda scope, roles: order.append(f"push:{scope}:{roles}"))
    monkeypatch.setattr(services, "incr_role_version", incr)
    monkeypatch.setattr(services.event_bus, "async_emit", emit_event)
    monkeypatch.setattr(services, "emit_permission_changed", push)

    await services.publish_role_change(object(), ["editor", "editor", "viewer"], deleted=True)

    assert order == [
        "incr:editor",
        "RolePermissionsChangedEvent",
        "RoleDeletedEvent",
        "incr:viewer",
        "RolePermissionsChangedEvent",
        "RoleDeletedEvent",
        "push:roles:['editor', 'viewer']",
    ]
    assert emit_event.await_args_list[0] == call(RolePermissionsChangedEvent(role_code="editor"), source="permission")
    assert emit_event.await_args_list[1] == call(RoleDeletedEvent(role_code="editor"), source="permission")


async def test_publish_without_delete_skips_deleted_event(monkeypatch):
    monkeypatch.setattr(services, "incr_role_version", AsyncMock(return_value=1))
    emit_event = AsyncMock()
    monkeypatch.setattr(services.event_bus, "async_emit", emit_event)
    monkeypatch.setattr(services, "emit_permission_changed", AsyncMock())

    await services.publish_role_change(object(), ["editor"])

    assert [type(c.args[0]) for c in emit_event.await_args_list] == [RolePermissionsChangedEvent]
