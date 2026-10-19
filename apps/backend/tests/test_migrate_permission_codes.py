# apps/backend/tests/test_migrate_permission_codes.py
"""迁移命令：干跑只输出报告，执行才写库，已有码的角色默认跳过。"""

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from plugin_permission.models import Role
from plugins.permission.tests.catalog_fixtures import DEFAULT_BINDINGS, make_catalog
from rapidkit_common.enums import MenuType
from src import migrate_permission_codes as command


def _session(roles, menus):
    role_result = MagicMock()
    role_result.all.return_value = roles
    menu_result = MagicMock()
    menu_result.all.return_value = menus
    return MagicMock(exec=AsyncMock(side_effect=[role_result, menu_result]), add=MagicMock(), commit=AsyncMock())


def _roles():
    fresh = Role(name="editor", code="editor", interface_permissions=["GET:/api/v1/users"])
    migrated = Role(
        name="viewer", code="viewer", permission_codes=["role:read"], interface_permissions=["GET:/api/v1/users"]
    )
    return fresh, migrated


def _menus():
    return [
        SimpleNamespace(route_name="manage", menu_type=MenuType.DIRECTORY, constant=False, interfaces=[]),
        SimpleNamespace(
            route_name="manage_user", menu_type=MenuType.MENU, constant=False, interfaces=["GET:/custom/export"]
        ),
    ]


@pytest.fixture
def context(monkeypatch):
    monkeypatch.setattr(command, "catalog_from_app", lambda app: (make_catalog(), DEFAULT_BINDINGS))
    monkeypatch.setattr(command, "collect_exempt_route_keys", lambda routes: set())
    monkeypatch.setattr(command, "read_legacy_menus", AsyncMock(side_effect=lambda session: _menus()))
    bump = AsyncMock()
    monkeypatch.setattr(command, "bump_role_versions", bump)
    return bump


async def test_dry_run_reports_without_writing(context, capsys):
    fresh, migrated = _roles()
    session = _session([fresh, migrated], _menus())

    await command.migrate(session, apply=False, force=False)

    output = capsys.readouterr().out
    assert "角色 editor" in output and "GET:/custom/export" in output
    assert fresh.permission_codes == []
    session.commit.assert_not_awaited()
    context.assert_not_awaited()


async def test_apply_writes_codes_and_skips_migrated_roles(context, capsys):
    fresh, migrated = _roles()
    session = _session([fresh, migrated], _menus())

    await command.migrate(session, apply=True, force=False)

    assert fresh.permission_codes == ["user:read"]
    assert migrated.permission_codes == ["role:read"]
    assert "跳过 viewer" in capsys.readouterr().out
    session.commit.assert_awaited_once()
    context.assert_awaited_once_with(["editor"])


async def test_force_overwrites_migrated_roles(context):
    fresh, migrated = _roles()
    session = _session([fresh, migrated], _menus())

    await command.migrate(session, apply=True, force=True)

    assert migrated.permission_codes == ["user:read"]
    context.assert_awaited_once_with(["editor", "viewer"])


def test_cli_requires_explicit_mode():
    with pytest.raises(SystemExit):
        command.parse_args([])
    assert command.parse_args(["--dry-run"]).apply is False
    args = command.parse_args(["--apply", "--force"])
    assert args.apply is True and args.force is True
